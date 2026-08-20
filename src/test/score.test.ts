import { describe, it, expect } from "vitest";
import { displayScore } from "@/lib/score";

describe("displayScore", () => {
  it("never returns below 85, even at the true score floor", () => {
    for (const trueScore of [0, 1, 5, -10, -1000]) {
      expect(displayScore(trueScore)).toBeGreaterThanOrEqual(85);
    }
  });

  it("never exceeds 99, even above the true score ceiling", () => {
    for (const trueScore of [100, 150, 1000]) {
      expect(displayScore(trueScore)).toBeLessThanOrEqual(99);
    }
  });

  it("maps 0 -> 85 and 100 -> 99", () => {
    expect(displayScore(0)).toBe(85);
    expect(displayScore(100)).toBe(99);
  });
});
