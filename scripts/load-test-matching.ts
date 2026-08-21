// THROWAWAY load-test script. Not part of the app build. Creates a dummy
// event (code LOADXX) with 70 fake participants, invokes the live
// run-matching edge function against it, and prints a full report.
// Does NOT clean up afterward.
//
// Usage: npx tsx scripts/load-test-matching.ts

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { displayScore } from "../src/lib/score.ts";
import {
  type Participant as ScoringParticipant,
  type QuestionConfig,
  ALIGNMENT_CATEGORIES,
  COMPLEMENT_CATEGORIES,
  CLUSTER_DEFINITIONS,
  calculateCompatibility,
} from "../supabase/functions/run-matching/scoring.ts";

// ─── env / client setup ──────────────────────────────────────────────────

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = readFileSync(path, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(new URL("../.env", import.meta.url).pathname);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── seeded RNG for reproducible-but-varied generation ──────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function weightedPick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

type LiveQuestion = {
  id: string;
  question: string;
  category: string | null;
  options: string[];
  is_ordinal: boolean;
  match_key: string | null;
  sort_order: number;
};

async function main() {
  // ── Step 1: read the live question set ──────────────────────────────────
  const { data: questionsRaw, error: qError } = await supabase
    .from("questions")
    .select("id, question, category, options, is_ordinal, match_key, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (qError) throw qError;
  if (!questionsRaw || questionsRaw.length === 0) {
    throw new Error("No active questions found — cannot build test answers");
  }
  const liveQuestions = questionsRaw as LiveQuestion[];

  console.log(`\n=== Live question set (${liveQuestions.length} questions) ===`);
  for (const q of liveQuestions) {
    console.log(
      `${q.sort_order}. [${q.category ?? "no-category"}]${q.is_ordinal ? " (ordinal)" : ""}${
        q.match_key ? ` (match_key=${q.match_key})` : ""
      } ${q.question}`
    );
    console.log(`   options: ${q.options.join(" | ")}`);
  }

  const conflictQuestion = liveQuestions.find((q) => q.category === "conflict");
  let opposedPair: [string, string] | null = null;
  if (conflictQuestion) {
    const def = CLUSTER_DEFINITIONS[conflictQuestion.question];
    const opposed = def?.opposed?.[0];
    if (opposed) {
      const [clusterA, clusterB] = opposed;
      const optA = def.clusters[clusterA]?.[0];
      const optB = def.clusters[clusterB]?.[0];
      if (optA && optB) opposedPair = [optA, optB];
    }
  }
  if (!conflictQuestion || !opposedPair) {
    throw new Error(
      "Could not find a conflict question with a defined opposed cluster pair in CLUSTER_DEFINITIONS"
    );
  }

  // Optional love-language pair, purely informational for this run — no
  // forced overlap is injected; distribution is measured as it falls out.
  const givingQuestion = liveQuestions.find((q) => q.match_key === "love_giving");
  const receivingQuestion = liveQuestions.find((q) => q.match_key === "love_receiving");

  // ── Step 2: create the dummy event ───────────────────────────────────────
  const adminPassword = `zz-loadtest-${randomUUID().slice(0, 8)}`;
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      name: "LOAD TEST — DO NOT USE",
      code: `LOADXX${randomUUID().slice(0, 4).toUpperCase()}`,
      age_range: 5,
      admin_password: adminPassword,
      status: "waiting",
    })
    .select()
    .single();
  if (eventError) throw eventError;

  console.log(`\n=== Dummy event created ===`);
  console.log(`id: ${event.id}, code: ${event.code}, name: ${event.name}`);

  // ── Step 3: generate 70 fake participants ────────────────────────────────
  const TOTAL = 70;
  const NB_ONLY_STRESS_COUNT = 6; // >= 5 required
  const OPPOSED_CONFLICT_COUNT = 8; // 4 pairs
  const PERSONA_COUNT = 5;
  const PREFER_PROB = 0.65; // clustering strength

  const HOBBY_POOL = [
    "Reading",
    "Gaming",
    "Music",
    "Sports",
    "Travel",
    "Cooking",
    "Art",
    "Photography",
    "Fitness",
    "Movies",
    "Coffee",
    "Hiking",
    "Tech",
  ];

  type Def = {
    name: string;
    age: number;
    gender: string;
    orientation: string;
    show_me: string[];
    hobbies: string[];
    forcedConflictAnswer?: string;
  };

  // Assign the two special-purpose groups to disjoint index ranges so they
  // don't collide with each other.
  const nbOnlyIndices = new Set<number>();
  while (nbOnlyIndices.size < NB_ONLY_STRESS_COUNT) {
    nbOnlyIndices.add(Math.floor(rng() * TOTAL));
  }
  const opposedIndices = new Set<number>();
  while (opposedIndices.size < OPPOSED_CONFLICT_COUNT) {
    const i = Math.floor(rng() * TOTAL);
    if (!nbOnlyIndices.has(i)) opposedIndices.add(i);
  }
  const opposedOrder = [...opposedIndices];

  const defs: Def[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const gender = weightedPick<string>([
      ["Man", 45],
      ["Woman", 45],
      ["Non-binary", 7],
      ["Other", 3],
    ]);

    const age = 18 + Math.floor(rng() * 8); // 18-25

    let show_me: string[];
    if (nbOnlyIndices.has(i)) {
      show_me = ["Non-binary"];
    } else {
      const shape = weightedPick<"one" | "two" | "everyone">([
        ["one", 50],
        ["two", 35],
        ["everyone", 15],
      ]);
      if (shape === "everyone") {
        show_me = ["Everyone"];
      } else if (shape === "one") {
        show_me = [pick(["Men", "Women"])];
      } else {
        const options = ["Men", "Women", "Non-binary"];
        const a = pick(options);
        let b = pick(options);
        while (b === a) b = pick(options);
        show_me = [a, b];
      }
    }

    const orientation = pick(["Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Other"]);

    const hobbyCount = 2 + Math.floor(rng() * 2);
    const hobbies = new Set<string>();
    while (hobbies.size < hobbyCount) hobbies.add(pick(HOBBY_POOL));

    let forcedConflictAnswer: string | undefined;
    if (opposedIndices.has(i)) {
      const posInGroup = opposedOrder.indexOf(i);
      forcedConflictAnswer = posInGroup % 2 === 0 ? opposedPair![0] : opposedPair![1];
    }

    defs.push({
      name: `ZZ-Load-${String(i + 1).padStart(2, "0")}`,
      age,
      gender,
      orientation,
      show_me,
      hobbies: [...hobbies],
      forcedConflictAnswer,
    });
  }

  const rows = defs.map((def, pIndex) => {
    const persona = pIndex % PERSONA_COUNT;
    const answers = liveQuestions.map((q, qIndex) => {
      if (q.id === conflictQuestion.id && def.forcedConflictAnswer) {
        return { question_id: q.id, answer: def.forcedConflictAnswer };
      }
      const n = q.options.length;
      const preferredIdx = (persona * 2 + qIndex * 3) % n;
      const answer = rng() < PREFER_PROB ? q.options[preferredIdx] : pick(q.options);
      return { question_id: q.id, answer };
    });

    return {
      event_id: event.id,
      session_token: randomUUID(),
      name: def.name,
      age: def.age,
      city: "Testville",
      gender: def.gender,
      orientation: def.orientation,
      show_me: def.show_me,
      hobbies: def.hobbies,
      answers,
    };
  });

  const { data: insertedParticipants, error: pError } = await supabase
    .from("participants")
    .insert(rows)
    .select("id, name, age, gender, show_me");
  if (pError) throw pError;

  console.log(`\n=== Inserted ${insertedParticipants.length} fake participants ===`);
  console.log(
    `Gender split: ${
      ["Man", "Woman", "Non-binary", "Other"]
        .map((g) => `${g}=${defs.filter((d) => d.gender === g).length}`)
        .join(", ")
    }`
  );
  console.log(`Non-binary-only show_me stress group: ${NB_ONLY_STRESS_COUNT} participants`);
  console.log(`Opposed-conflict-answer group: ${OPPOSED_CONFLICT_COUNT} participants (${OPPOSED_CONFLICT_COUNT / 2} pairs)`);

  // ── Step 4: invoke the run-matching edge function ────────────────────────
  console.log(`\n=== Invoking run-matching edge function ===`);
  const { data: fnData, error: fnError } = await supabase.functions.invoke("run-matching", {
    body: { eventId: event.id, adminPassword },
  });
  if (fnError) {
    console.error("run-matching invocation failed:", fnError);
    const ctx = (fnError as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try {
        console.error("response body:", await ctx.json());
      } catch {
        // ignore
      }
    }
    throw fnError;
  }
  console.log("run-matching response:", fnData);

  // ── Step 5: pull results and build the report ────────────────────────────
  const { data: resultsRaw, error: rError } = await supabase
    .from("participants")
    .select(
      "id, name, age, gender, show_me, orientation, hobbies, answers, matched_to, compatibility_score, compatibility_badge"
    )
    .eq("event_id", event.id);
  if (rError) throw rError;

  const results = resultsRaw as (ScoringParticipant & {
    show_me: string[];
    compatibility_score: number | null;
    compatibility_badge: string | null;
  })[];

  const byId = new Map(results.map((r) => [r.id, r]));
  const matched = results.filter((r) => r.matched_to);
  const unmatched = results.filter((r) => !r.matched_to);

  console.log(`\n\n########## LOAD TEST REPORT ##########`);

  // a. counts
  console.log(`\n--- (a) Overview ---`);
  console.log(`Total participants: ${results.length}`);
  console.log(`Matched: ${matched.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Match rate: ${((matched.length / results.length) * 100).toFixed(1)}%`);

  // b. unmatched detail + pool-constraint check
  console.log(`\n--- (b) Unmatched participants ---`);
  if (unmatched.length === 0) {
    console.log("None.");
  } else {
    for (const u of unmatched) {
      // How many *other* unmatched-or-any participants would have been a
      // structurally valid candidate (age + orientation gates), regardless
      // of whether they too ended up matched to someone else. This tells us
      // whether the pool simply didn't have enough eligible partners.
      const eligiblePool = results.filter((other) => {
        if (other.id === u.id) return false;
        if (Math.abs(other.age - u.age) > event.age_range) return false;
        return checkOrientationCompatible(u, other);
      });
      console.log(
        `${u.name} — age ${u.age}, gender ${u.gender}, show_me [${u.show_me.join(", ")}] — ` +
          `${eligiblePool.length} structurally-eligible candidates in the full pool`
      );
    }
  }

  // c. true score distribution
  console.log(`\n--- (c) TRUE compatibility score distribution (matched only) ---`);
  const trueScores = matched
    .map((m) => m.compatibility_score)
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b);
  printDistribution(trueScores, "true score");

  // d. displayed score distribution
  console.log(`\n--- (d) DISPLAYED score distribution (post display-floor) ---`);
  const displayedScores = trueScores.map((s) => displayScore(s));
  printDistribution(displayedScores, "displayed score");
  const belowFloor = displayedScores.filter((s) => s < 85);
  console.log(
    belowFloor.length === 0
      ? "Confirmed: every displayed score is >= 85."
      : `WARNING: ${belowFloor.length} displayed scores are below 85: ${belowFloor.join(", ")}`
  );

  // ── local recompute of matched pairs for e/f/h, and a sanity check
  // against the persisted (edge-function-produced) scores ──────────────
  const questionConfigs = buildQuestionConfigs(liveQuestions);
  const seenPairs = new Set<string>();
  const pairResults: {
    p1: ScoringParticipant;
    p2: ScoringParticipant;
    result: ReturnType<typeof calculateCompatibility>;
    persistedScore: number | null;
  }[] = [];

  const warnCaptures: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnCaptures.push(args);
  };
  try {
    for (const p of matched) {
      const key = [p.id, p.matched_to].sort().join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const partner = byId.get(p.matched_to as string);
      if (!partner) continue;
      const result = calculateCompatibility(p, partner, event.age_range, questionConfigs);
      pairResults.push({ p1: p, p2: partner, result, persistedScore: p.compatibility_score });
    }
  } finally {
    console.warn = originalWarn;
  }

  const mismatches = pairResults.filter(
    (pr) => pr.persistedScore != null && pr.persistedScore !== pr.result.score
  );
  console.log(`\n--- Local recompute vs. persisted score sanity check ---`);
  console.log(
    `${pairResults.length} matched pairs recomputed locally using current scoring.ts. ` +
      `${mismatches.length} disagree with the persisted compatibility_score.`
  );
  if (mismatches.length > 0) {
    console.log(
      "This means the DEPLOYED run-matching edge function does not match the local scoring.ts " +
        "(e.g. a stale deploy). Sections (e) and (f) below reflect the LOCAL algorithm applied to " +
        "the same participant data, not necessarily the exact logic that produced the persisted " +
        "true/displayed scores in (c)/(d)."
    );
    console.log(
      "  sample mismatch: " +
        `${mismatches[0].p1.name} <-> ${mismatches[0].p2.name}: persisted=${mismatches[0].persistedScore}, local=${mismatches[0].result.score}`
    );
  }

  // e. per-question non-null coverage across matched pairs
  console.log(`\n--- (e) Per-question answer coverage across matched pairs ---`);
  const alignmentQs = liveQuestions.filter((q) => ALIGNMENT_CATEGORIES.includes(q.category ?? ""));
  const complementQs = liveQuestions.filter(
    (q) => COMPLEMENT_CATEGORIES.includes(q.category ?? "") && !q.match_key
  );
  console.log(
    `Live question set currently has ${alignmentQs.length} alignment-scored question(s) and ` +
      `${complementQs.length} complement-scored question(s) (categories that appear in ` +
      `ALIGNMENT_CATEGORIES/COMPLEMENT_CATEGORIES, excluding match_key pairs for complement).`
  );

  function reportCoverage(label: string, qs: LiveQuestion[]) {
    console.log(`\n${label}:`);
    for (const q of qs) {
      let nonNull = 0;
      for (const { p1, p2 } of pairResults) {
        const a1 = p1.answers.find((a) => a.question_id === q.id)?.answer;
        const a2 = p2.answers.find((a) => a.question_id === q.id)?.answer;
        if (a1 == null || a2 == null) continue;
        if (q.is_ordinal) {
          if (q.options.includes(a1) && q.options.includes(a2)) nonNull++;
        } else {
          nonNull++;
        }
      }
      const frac = pairResults.length > 0 ? (nonNull / pairResults.length) * 100 : 0;
      console.log(`  "${q.question}" — ${nonNull}/${pairResults.length} pairs (${frac.toFixed(1)}%)`);
    }
  }
  reportCoverage("Alignment questions", alignmentQs);
  reportCoverage("Complement questions", complementQs);

  // f. love-language cross-pair bonus
  console.log(`\n--- (f) Love-language cross-pair bonus ---`);
  if (!givingQuestion || !receivingQuestion) {
    console.log("No love_giving/love_receiving match_key pair found in the live question set.");
  } else {
    const buckets = new Map<number, number>();
    let nonZero = 0;
    for (const { result } of pairResults) {
      buckets.set(result.loveLanguageScore, (buckets.get(result.loveLanguageScore) ?? 0) + 1);
      if (result.loveLanguageScore > 0) nonZero++;
    }
    console.log(
      `${nonZero}/${pairResults.length} matched pairs (${(
        (nonZero / pairResults.length) *
        100
      ).toFixed(1)}%) got a non-zero love-language bonus.`
    );
    console.log("Distribution:");
    for (const [score, count] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${score}: ${count} pair(s)`);
    }
  }

  // g. sample reveal texts across score ranges
  console.log(`\n--- (g) Sample reveal texts across score ranges ---`);
  const withBadge = matched
    .filter((m) => m.compatibility_score != null && m.compatibility_badge)
    .sort((a, b) => (a.compatibility_score ?? 0) - (b.compatibility_score ?? 0));
  if (withBadge.length === 0) {
    console.log("No matched participants with a score/badge to sample.");
  } else {
    const n = withBadge.length;
    const sampleIdxs = [0, Math.floor(n * 0.33), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
    const seen = new Set<number>();
    for (const idx of sampleIdxs) {
      const clamped = Math.min(n - 1, Math.max(0, idx));
      if (seen.has(clamped)) continue;
      seen.add(clamped);
      const p = withBadge[clamped];
      console.log(
        `\n[true=${p.compatibility_score}, displayed=${displayScore(p.compatibility_score!)}%] ${p.name}:`
      );
      console.log(`  "${p.compatibility_badge}"`);
    }
  }

  // h. console.warn output from getAnswerDistance during local recompute
  console.log(`\n--- (h) console.warn output during local recompute ---`);
  console.log(`${warnCaptures.length} warning(s) captured.`);
  for (const w of warnCaptures.slice(0, 5)) {
    console.log("  ", ...w);
  }

  console.log(
    `\nDummy event NOT deleted. code=LOADXX id=${event.id}, ${results.length} participants left in place.`
  );
}

function printDistribution(sorted: number[], label: string) {
  if (sorted.length === 0) {
    console.log(`No ${label} data.`);
    return;
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  console.log(
    `min=${min} max=${max} mean=${mean.toFixed(1)} median=${median} n=${sorted.length}`
  );

  const buckets = new Map<number, number>();
  for (const v of sorted) {
    const bucket = v >= 100 ? 90 : Math.floor(v / 10) * 10;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  for (let b = 0; b <= 90; b += 10) {
    const count = buckets.get(b) ?? 0;
    const bar = "#".repeat(count);
    console.log(`  ${String(b).padStart(3)}-${b + 9}: ${String(count).padStart(3)} ${bar}`);
  }
}

function buildQuestionConfigs(liveQuestions: LiveQuestion[]): Map<string, QuestionConfig> {
  const map = new Map<string, QuestionConfig>();
  for (const q of liveQuestions) {
    const category = q.category || "neutral";
    let type: "alignment" | "complement" | "neutral" = "neutral";
    if (ALIGNMENT_CATEGORIES.includes(category)) type = "alignment";
    else if (COMPLEMENT_CATEGORIES.includes(category)) type = "complement";
    map.set(q.id, {
      question: q.question,
      category,
      type,
      options: q.options,
      is_ordinal: q.is_ordinal,
      match_key: q.match_key,
    });
  }
  return map;
}

function checkOrientationCompatible(
  p1: { gender: string; show_me: string[] },
  p2: { gender: string; show_me: string[] }
): boolean {
  const genderMap: Record<string, string> = {
    Man: "Men",
    Woman: "Women",
    "Non-binary": "Non-binary",
    Other: "Non-binary",
  };
  const p1Gender = genderMap[p1.gender] || "Everyone";
  const p2Gender = genderMap[p2.gender] || "Everyone";
  const p1WantsP2 = p1.show_me.includes(p2Gender) || p1.show_me.includes("Everyone");
  const p2WantsP1 = p2.show_me.includes(p1Gender) || p2.show_me.includes("Everyone");
  return p1WantsP2 && p2WantsP1;
}

main().catch((err) => {
  console.error("\nLoad test script failed:", err);
  process.exitCode = 1;
});
