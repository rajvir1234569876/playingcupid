// Pure greedy assignment logic for the matching algorithm. Kept free of
// Deno-only APIs and remote imports so it can be unit tested directly (see
// src/test/matching.test.ts) without spinning up the edge function's
// Deno.serve handler — same reasoning as scoring.ts.

import {
  type Participant,
  type QuestionConfig,
  type CompatibilityResult,
  calculateCompatibility,
  generateBadge,
} from "./scoring.ts";

export interface MatchResult {
  id: string;
  matchId: string;
  score: number;
  badge: string;
}

interface PairScore {
  p1: string;
  p2: string;
  result: CompatibilityResult;
}

function scorePairs(
  pool: Participant[],
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): PairScore[] {
  const scores: PairScore[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const result = calculateCompatibility(pool[i], pool[j], ageRange, questionConfigs);
      if (!result.rejected && result.score > 0) {
        scores.push({ p1: pool[i].id, p2: pool[j].id, result });
      }
    }
  }
  return scores;
}

// One greedy assignment pass over `pool`: score every eligible pair, sort
// best-first, and claim pairs greedily.
//
// NOTE: because this scores and sorts *every* pair up front and then walks
// the full sorted list to completion, two mutually-eligible people (a
// non-rejected, score > 0 pair) can never both end up unmatched by a single
// pass — when their pair's turn comes up in the list, neither can already
// be claimed (claiming is permanent, and "both end unmatched" means
// neither is ever claimed), so the pass would claim them right there. The
// same argument extends to any single-edge "swap" repair too: if some
// unmatched X could beat some matched T's current partner
// (score(X,T) > score(T, incumbent)), the X-T edge would have sorted
// *before* T's actual matching edge and would have claimed them both then.
// So nobody left unmatched after this pass can be rescued by re-scoring
// pairs against the leftovers alone, or by a single swap against an
// existing pair — see matchParticipants' augmenting-path repair below for
// the reason that still works.
export function greedyPass(
  pool: Participant[],
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): { matches: MatchResult[]; unmatched: Participant[] } {
  const scores = scorePairs(pool, ageRange, questionConfigs);
  scores.sort((a, b) => b.result.score - a.result.score);

  const claimed = new Set<string>();
  const matches: MatchResult[] = [];

  for (const { p1, p2, result } of scores) {
    if (!claimed.has(p1) && !claimed.has(p2)) {
      const badge = generateBadge(result);
      matches.push({ id: p1, matchId: p2, score: result.score, badge });
      matches.push({ id: p2, matchId: p1, score: result.score, badge });
      claimed.add(p1);
      claimed.add(p2);
    }
  }

  const unmatched = pool.filter((p) => !claimed.has(p.id));
  return { matches, unmatched };
}

// Depth-first search for an augmenting path starting from `startId`, an
// unmatched participant: an alternating chain of (eligible, unused) edges
// and (existing-match) edges that ends at a *different* unmatched
// participant. Concretely: start -> T1 (new edge) -> T1's current partner
// P1 (existing edge, forced) -> T2 (new edge) -> P2 (existing edge) -> ...
// -> end (new edge, end is unmatched). Flipping every edge on the path —
// breaking each existing-match edge, creating each "new edge" as a match —
// nets exactly two more matched people (start and end) while everyone else
// on the path keeps exactly one partner, just a different one. This is
// standard augmenting-path search for maximum-cardinality matching; unlike
// a single swap, it does not require any edge on the path to score higher
// than what it replaces, only that the whole chain is eligible end to end.
//
// This implementation uses a single per-search `visited` set and does not
// contract blossoms (odd alternating cycles), so on general (non-bipartite)
// graphs it can occasionally miss a valid augmenting path that a full
// Edmonds'-blossom search would find. That's an accepted, deliberate
// simplification for this scale of event — worth revisiting only if live
// events start seeing unmatched counts that don't shrink further even
// though eligible chains clearly exist.
function findAugmentingPath(
  startId: string,
  allIds: string[],
  byId: Map<string, Participant>,
  matchIndex: Map<string, string>,
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): string[] | null {
  const visited = new Set<string>([startId]);

  function dfs(currentId: string, path: string[]): string[] | null {
    const current = byId.get(currentId)!;

    // Try better-scoring candidates first so that, when several augmenting
    // paths exist, the search tends to land on a stronger one.
    const candidates = allIds
      .filter((id) => !visited.has(id))
      .map((id) => ({ id, result: calculateCompatibility(current, byId.get(id)!, ageRange, questionConfigs) }))
      .filter((c) => !c.result.rejected && c.result.score > 0)
      .sort((a, b) => b.result.score - a.result.score);

    for (const { id: candidateId } of candidates) {
      if (!matchIndex.has(candidateId)) {
        // Reached someone else who is unmatched — path complete.
        return [...path, candidateId];
      }

      const partnerId = matchIndex.get(candidateId)!;
      if (visited.has(candidateId) || visited.has(partnerId)) continue;
      visited.add(candidateId);
      visited.add(partnerId);

      const deeper = dfs(partnerId, [...path, candidateId, partnerId]);
      if (deeper) return deeper;
    }

    return null;
  }

  return dfs(startId, [startId]);
}

// Runs the initial greedy assignment pass, then repeatedly looks for
// augmenting paths that convert two unmatched people into matched ones by
// re-threading the existing matches along the way (see findAugmentingPath).
// Repeats full scans until one finds no further progress, everyone-but-one
// is matched, or the safety cap is hit. A single leftover participant
// (odd pool size, or genuinely no eligible chain to anyone) is left
// unmatched rather than forced into a bad pairing.
export function matchParticipants(
  pool: Participant[],
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): { matches: MatchResult[]; unmatched: Participant[] } {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const allIds = pool.map((p) => p.id);

  const firstPass = greedyPass(pool, ageRange, questionConfigs);
  const matchIndex = new Map<string, string>();
  for (const m of firstPass.matches) matchIndex.set(m.id, m.matchId);

  const unmatchedIds = new Set(firstPass.unmatched.map((p) => p.id));

  const MAX_ATTEMPTS = pool.length * pool.length + 10;
  let attempts = 0;
  let madeProgress = true;

  while (madeProgress && unmatchedIds.size >= 2 && attempts < MAX_ATTEMPTS) {
    madeProgress = false;

    for (const startId of [...unmatchedIds]) {
      if (attempts >= MAX_ATTEMPTS) break;
      attempts++;

      if (!unmatchedIds.has(startId)) continue; // consumed earlier this scan

      const path = findAugmentingPath(startId, allIds, byId, matchIndex, ageRange, questionConfigs);
      if (!path) continue;

      for (let i = 0; i + 1 < path.length; i += 2) {
        matchIndex.set(path[i], path[i + 1]);
        matchIndex.set(path[i + 1], path[i]);
      }
      unmatchedIds.delete(path[0]);
      unmatchedIds.delete(path[path.length - 1]);
      madeProgress = true;
    }
  }

  // Rebuild the output list with fresh scores/badges for the final pairing.
  const matches: MatchResult[] = [];
  const seenPairs = new Set<string>();
  for (const [id, partnerId] of matchIndex) {
    const pairKey = [id, partnerId].sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const a = byId.get(id)!;
    const b = byId.get(partnerId)!;
    const result = calculateCompatibility(a, b, ageRange, questionConfigs);
    const badge = generateBadge(result);
    matches.push({ id: a.id, matchId: b.id, score: result.score, badge });
    matches.push({ id: b.id, matchId: a.id, score: result.score, badge });
  }

  const unmatched = pool.filter((p) => unmatchedIds.has(p.id));
  return { matches, unmatched };
}
