import { describe, it, expect } from "vitest";
import {
  calculateCompatibility,
  checkOrientationCompatibility,
  type Participant,
  type QuestionConfig,
} from "../../supabase/functions/run-matching/scoring";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    id: "p1",
    event_id: "event-1",
    name: "Test",
    age: 20,
    gender: "Woman",
    orientation: "Straight",
    show_me: ["Men"],
    hobbies: [],
    answers: [],
    matched_to: null,
    ...overrides,
  };
}

function config(overrides: Partial<QuestionConfig>): QuestionConfig {
  return {
    question: "",
    category: "lifestyle",
    type: "neutral",
    options: [],
    is_ordinal: false,
    match_key: null,
    ...overrides,
  };
}

describe("calculateCompatibility", () => {
  it("scores an ordinal question by distance", () => {
    const socialBatteryOptions = [
      "100% Extrovert",
      "Mostly outgoing",
      "Depends on the crowd",
      "Mostly introverted",
      "Recharge alone",
    ];
    const configs = new Map<string, QuestionConfig>([
      [
        "social_battery",
        config({
          question: "Your social battery?",
          category: "personality",
          is_ordinal: true,
          options: socialBatteryOptions,
        }),
      ],
    ]);

    const near = calculateCompatibility(
      makeParticipant({
        id: "a",
        gender: "Man",
        show_me: ["Women"],
        answers: [{ question_id: "social_battery", answer: "100% Extrovert" }],
      }),
      makeParticipant({
        id: "b",
        gender: "Woman",
        show_me: ["Men"],
        answers: [{ question_id: "social_battery", answer: "Mostly outgoing" }],
      }),
      10,
      configs
    );

    const far = calculateCompatibility(
      makeParticipant({
        id: "a",
        gender: "Man",
        show_me: ["Women"],
        answers: [{ question_id: "social_battery", answer: "100% Extrovert" }],
      }),
      makeParticipant({
        id: "b",
        gender: "Woman",
        show_me: ["Men"],
        answers: [{ question_id: "social_battery", answer: "Recharge alone" }],
      }),
      10,
      configs
    );

    // Distance-1 (complement scoring: 0.9) should beat distance-4 (0.3).
    expect(near.complementScore).toBeGreaterThan(far.complementScore);
  });

  it("does not score a categorical question by index distance", () => {
    // "Golden Retriever" (warm cluster) vs "Evil Villain" (mysterious
    // cluster) is the maximum possible index distance, but this question
    // is categorical (is_ordinal: false) so it must NOT be scored via
    // index arithmetic — it goes through cluster scoring instead, and
    // "energy" has no opposed pair, so a cross-cluster mismatch still
    // scores as an ideal complement (1.0), never the ordinal "extreme
    // distance" penalty (0.3).
    const energyOptions = [
      "Golden Retriever",
      "Black Cat",
      "Main Character",
      "Comic relief",
      "Disney Princess",
      "Evil Villain",
    ];
    const configs = new Map<string, QuestionConfig>([
      [
        "energy",
        config({
          question: "What's your energy?",
          category: "personality",
          is_ordinal: false,
          options: energyOptions,
        }),
      ],
    ]);

    const result = calculateCompatibility(
      makeParticipant({
        id: "a",
        gender: "Man",
        show_me: ["Women"],
        answers: [{ question_id: "energy", answer: "Golden Retriever" }],
      }),
      makeParticipant({
        id: "b",
        gender: "Woman",
        show_me: ["Men"],
        answers: [{ question_id: "energy", answer: "Evil Villain" }],
      }),
      10,
      configs
    );

    expect(result.complementScore).toBe(1.0);
  });

  it("no longer eliminates a pair on a cross-cluster (opposed) conflict answer", () => {
    const conflictOptions = [
      "Talk it out immediately",
      "Need time before talking",
      "Try to compromise",
      "Crack jokes to lighten the mood",
      "Hear everyone out first",
      "Avoid conflict if possible",
    ];
    const configs = new Map<string, QuestionConfig>([
      [
        "conflict",
        config({
          question: "How do you handle disagreements?",
          category: "conflict",
          is_ordinal: false,
          options: conflictOptions,
        }),
      ],
    ]);

    // engage_now vs withdraw is the explicitly opposed pair (tier
    // "opposed", alignment score 0.1) — under the old code this distance
    // would have set `rejected: true` and killed the whole match.
    const result = calculateCompatibility(
      makeParticipant({
        id: "a",
        gender: "Man",
        show_me: ["Women"],
        answers: [{ question_id: "conflict", answer: "Talk it out immediately" }],
      }),
      makeParticipant({
        id: "b",
        gender: "Woman",
        show_me: ["Men"],
        answers: [{ question_id: "conflict", answer: "Avoid conflict if possible" }],
      }),
      10,
      configs
    );

    expect(result.rejected).toBe(false);
    expect(result.alignmentScore).toBe(0.1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("matches a non-binary participant with someone who selected Non-binary people", () => {
    const nonBinary = makeParticipant({
      id: "a",
      gender: "Non-binary",
      show_me: ["Everyone"],
    });
    const partner = makeParticipant({
      id: "b",
      gender: "Woman",
      show_me: ["Non-binary"],
    });

    expect(checkOrientationCompatibility(nonBinary, partner)).toBe(true);

    const result = calculateCompatibility(nonBinary, partner, 10, new Map());
    expect(result.rejected).toBe(false);
  });
});
