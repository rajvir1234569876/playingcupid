import { describe, it, expect } from "vitest";
import { type Participant, type QuestionConfig } from "../../supabase/functions/run-matching/scoring";
import { matchParticipants, greedyPass } from "../../supabase/functions/run-matching/matching";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    id: "p",
    event_id: "event-1",
    name: "Test",
    age: 25,
    gender: "Man",
    orientation: "Straight",
    show_me: ["Everyone"],
    hobbies: [],
    answers: [],
    matched_to: null,
    ...overrides,
  };
}

describe("matchParticipants — repair pass", () => {
  // No questions/hobbies data, so every eligible pair ties at the same base
  // score (round(0*45 + 0.5*30 + 0*10 + 0*15) = 15). Ages are set up so age
  // is the *only* eligibility gate, and the only eligible pairs are:
  //   A-B (diff 5), A-C (diff 5), B-D (diff 5)
  // Every other pair (A-D, B-C, C-D, and anything with E) exceeds the
  // age_range of 5 and is rejected outright. E has no eligible edge to
  // anyone at all.
  const ageRange = 5;
  const questionConfigs = new Map<string, QuestionConfig>();

  const a = makeParticipant({ id: "A", age: 25 });
  const b = makeParticipant({ id: "B", age: 30 });
  const c = makeParticipant({ id: "C", age: 20 });
  const d = makeParticipant({ id: "D", age: 35 });
  const e = makeParticipant({ id: "E", age: 100 });
  const pool = [a, b, c, d, e];

  it("a single greedy pass strands C and D despite both being eligible for someone", () => {
    // Sanity check on the premise: with all scores tied, the double loop
    // over [A,B,C,D,E] enqueues A-B, A-C, B-D in that order (everything
    // else is rejected on age). A-B is claimed first, which — with no
    // further tie-break — leaves A-C and B-D both unusable even though C
    // and D each had a real, eligible partner available.
    const single = greedyPass(pool, ageRange, questionConfigs);
    const matchedIds = single.matches.map((m) => m.id).sort();
    expect(matchedIds).toEqual(["A", "B"]);
    expect(single.unmatched.map((p) => p.id).sort()).toEqual(["C", "D", "E"]);
  });

  it("the repair pass rescues C and D via an augmenting path through A-B", () => {
    const result = matchParticipants(pool, ageRange, questionConfigs);

    // C and D get pulled in — C paired with A, D paired with B — by
    // breaking the original A-B pair and re-threading it, not by C and D
    // matching each other directly (they aren't eligible for each other).
    const byId = new Map(result.matches.map((m) => [m.id, m.matchId]));
    expect(byId.get("C")).toBe("A");
    expect(byId.get("A")).toBe("C");
    expect(byId.get("D")).toBe("B");
    expect(byId.get("B")).toBe("D");

    expect(result.matches).toHaveLength(4);
  });

  it("leaves a genuinely unreachable single leftover (E) unmatched rather than forcing a pairing", () => {
    const result = matchParticipants(pool, ageRange, questionConfigs);
    expect(result.unmatched.map((p) => p.id)).toEqual(["E"]);
  });
});

describe("matchParticipants — no spurious changes when the greedy pass already covers everyone", () => {
  it("returns the same pairing greedyPass would when there's nothing to repair", () => {
    const ageRange = 5;
    const questionConfigs = new Map<string, QuestionConfig>();
    const a = makeParticipant({ id: "A", age: 25 });
    const b = makeParticipant({ id: "B", age: 26 });
    const pool = [a, b];

    const result = matchParticipants(pool, ageRange, questionConfigs);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matches.map((m) => m.id).sort()).toEqual(["A", "B"]);
  });
});
