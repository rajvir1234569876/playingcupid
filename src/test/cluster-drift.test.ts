import { describe, it, expect } from "vitest";
import { CLUSTER_DEFINITIONS } from "../../supabase/functions/run-matching/scoring";
import liveQuestions from "./fixtures/live-questions-snapshot.json";

// Guards against the exact bug this test was written to catch: cluster
// option strings silently going stale when the live question set changes
// (options trimmed/reworded) without the cluster map being updated to
// match. If this test fails, re-pull the live `questions` table and
// refresh both src/test/fixtures/live-questions-snapshot.json and the
// CLUSTER_DEFINITIONS option strings in scoring.ts.
describe("cluster definitions vs. live question set", () => {
  const liveQuestionByText = new Map(
    (liveQuestions as { question: string; options: string[] }[]).map((q) => [q.question, q.options])
  );

  it("every question keying a cluster definition exists in the live set", () => {
    for (const questionText of Object.keys(CLUSTER_DEFINITIONS)) {
      expect(liveQuestionByText.has(questionText)).toBe(true);
    }
  });

  it("every cluster option string exists in that question's live options", () => {
    const mismatches: string[] = [];

    for (const [questionText, def] of Object.entries(CLUSTER_DEFINITIONS)) {
      const liveOptions = liveQuestionByText.get(questionText);
      if (!liveOptions) {
        mismatches.push(`question not found in live set: "${questionText}"`);
        continue;
      }
      for (const [clusterName, options] of Object.entries(def.clusters)) {
        for (const option of options) {
          if (!liveOptions.includes(option)) {
            mismatches.push(
              `"${questionText}" cluster "${clusterName}": option "${option}" is not in the live options ${JSON.stringify(liveOptions)}`
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
