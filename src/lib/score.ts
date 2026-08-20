// Display-only compatibility score. The stored/true compatibility_score in
// the database is never modified — every UI surface that shows a
// compatibility percentage to a participant must render through this
// function instead of the raw value, so the displayed number always reads
// 85-99% regardless of the true underlying score.
export function displayScore(trueScore: number): number {
  const clamped = Math.max(0, Math.min(100, trueScore));
  return Math.round(85 + (clamped / 100) * 14); // maps 0-100 -> 85-99
}
