// Load test for the run-matching edge function against the LIVE Supabase project.
// Creates event MOCK300 with 300 fake participants, invokes run-matching, and
// reports timing + match quality. Cleans up on demand via --cleanup.
//
// Usage:
//   npx tsx scripts/load-test.ts                  # full test run
//   npx tsx scripts/load-test.ts --cleanup         # delete MOCK300 + stale LOADXX events only
//
// Env vars:
//   LOAD_TEST_ADMIN_PASSWORD   admin password in plaintext (default: mock300-loadtest)
//   APP_URL                    base URL of the app (default: http://localhost:8080)

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { displayScore } from "../src/lib/score.ts";
import {
  type Participant as ScoringParticipant,
  type QuestionConfig,
  ALIGNMENT_CATEGORIES,
  COMPLEMENT_CATEGORIES,
  calculateCompatibility,
} from "../supabase/functions/run-matching/scoring.ts";

// ─── constants ──────────────────────────────────────────────────────────────

const EVENT_CODE = "MCK300";
const EVENT_NAME = "LOAD TEST — MCK300 — DO NOT USE";
const TOTAL = 300;
const AGE_RANGE = 7; // participants range 17-24, max diff = 7
const ADMIN_PASSWORD =
  process.env.LOAD_TEST_ADMIN_PASSWORD ?? "mock300-loadtest";
const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");

const CLEANUP_ONLY = process.argv.slice(2).includes("--cleanup");

// Codes to purge in --cleanup mode (in addition to MOCK300).
const STALE_EVENT_CODE_PREFIXES = ["LOADXX"];
const STALE_EXACT_CODES = ["LOADXX", "LOADXXA21D"];

// ─── env / supabase client ───────────────────────────────────────────────────

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

const envFile = new URL("../.env", import.meta.url).pathname;
const envVars = loadEnv(envFile);
const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FATAL: missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── seeded RNG for reproducible output ─────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xdead_beef);

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

// ─── orientation helpers (mirrors scoring.ts exactly) ───────────────────────

const GENDER_MAP: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  "Non-binary": "Non-binary",
  Other: "Non-binary",
};

function orientationCompatible(
  p1: { gender: string; show_me: string[] },
  p2: { gender: string; show_me: string[] }
): boolean {
  const g1 = GENDER_MAP[p1.gender] || "Everyone";
  const g2 = GENDER_MAP[p2.gender] || "Everyone";
  const p1WantsP2 = p1.show_me.includes(g2) || p1.show_me.includes("Everyone");
  const p2WantsP1 = p2.show_me.includes(g1) || p2.show_me.includes("Everyone");
  return p1WantsP2 && p2WantsP1;
}

// ─── participant generation ──────────────────────────────────────────────────

type LiveQuestion = {
  id: string;
  question: string;
  category: string | null;
  options: string[];
  is_ordinal: boolean;
  match_key: string | null;
};

type ParticipantDef = {
  name: string;
  age: number;
  gender: string;
  orientation: string;
  show_me: string[];
  hobbies: string[];
};

// Ages 17-24 clustered toward 19-21 (college peak).
const AGE_WEIGHTS: [number, number][] = [
  [17, 4],
  [18, 14],
  [19, 22],
  [20, 22],
  [21, 18],
  [22, 12],
  [23, 6],
  [24, 2],
];

// Hobbies: common pool with higher weights on popular ones so participants
// overlap, not all-distinct.
const HOBBY_POOL: [string, number][] = [
  ["Movies", 8],
  ["Music", 8],
  ["Gaming", 7],
  ["Travel", 7],
  ["Reading", 6],
  ["Fitness", 5],
  ["Art", 4],
  ["Photography", 4],
  ["Cooking", 4],
  ["Sports", 4],
  ["Coffee", 3],
  ["Hiking", 3],
  ["Tech", 3],
  ["Dancing", 2],
  ["Yoga", 2],
];

function pickHobbies(): string[] {
  const count = 2 + Math.floor(rng() * 3); // 2-4
  const chosen = new Set<string>();
  let attempts = 0;
  while (chosen.size < count && attempts < 30) {
    chosen.add(weightedPick(HOBBY_POOL));
    attempts++;
  }
  return [...chosen];
}

function makeShowMe(gender: string): string[] {
  if (gender === "Man") {
    return weightedPick<string[]>([
      [["Women"], 62],
      [["Men"], 8],
      [["Men", "Women"], 12],
      [["Women", "Non-binary"], 5],
      [["Men", "Non-binary"], 3],
      [["Everyone"], 7],
      [["Non-binary"], 3],
    ]);
  }
  if (gender === "Woman") {
    return weightedPick<string[]>([
      [["Men"], 62],
      [["Women"], 8],
      [["Men", "Women"], 12],
      [["Men", "Non-binary"], 5],
      [["Women", "Non-binary"], 3],
      [["Everyone"], 7],
      [["Non-binary"], 3],
    ]);
  }
  if (gender === "Non-binary") {
    return weightedPick<string[]>([
      [["Everyone"], 35],
      [["Men"], 18],
      [["Women"], 18],
      [["Non-binary"], 14],
      [["Men", "Women"], 10],
      [["Men", "Women", "Non-binary"], 5],
    ]);
  }
  // Other (maps to Non-binary in genderMap)
  return weightedPick<string[]>([
    [["Everyone"], 50],
    [["Non-binary"], 25],
    [["Men", "Women"], 15],
    [["Men"], 5],
    [["Women"], 5],
  ]);
}

const ORIENTATIONS = [
  "Straight", "Bisexual", "Gay", "Lesbian", "Pansexual", "Queer", "Other",
];
const ORIENTATION_WEIGHTS: [string, number][] = [
  ["Straight", 55],
  ["Bisexual", 18],
  ["Gay", 8],
  ["Lesbian", 7],
  ["Pansexual", 6],
  ["Queer", 4],
  ["Other", 2],
];

function generateDefs(): ParticipantDef[] {
  const defs: ParticipantDef[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const gender = weightedPick<string>([
      ["Man", 45],
      ["Woman", 45],
      ["Non-binary", 8],
      ["Other", 2],
    ]);
    const age = weightedPick(AGE_WEIGHTS);
    const show_me = makeShowMe(gender);
    const orientation = weightedPick(ORIENTATION_WEIGHTS);
    const hobbies = pickHobbies();
    defs.push({
      name: `ZZ-Mock-${String(i + 1).padStart(3, "0")}`,
      age,
      gender,
      orientation,
      show_me,
      hobbies,
    });
  }
  return defs;
}

// 10 personas drive answer clustering — persona determines preferred option
// index per question, 70% pull from preferred index.
const NUM_PERSONAS = 10;
const PREFER_PROB = 0.70;

function generateAnswers(
  questions: LiveQuestion[],
  personaIdx: number
): { question_id: string; answer: string }[] {
  return questions.map((q, qIdx) => {
    const n = q.options.length;
    const preferredIdx = (personaIdx * 3 + qIdx * 2) % n;
    const answer =
      rng() < PREFER_PROB ? q.options[preferredIdx] : pick(q.options);
    return { question_id: q.id, answer };
  });
}

// ─── report helpers ──────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

function printDistribution(sorted: number[], label: string) {
  if (sorted.length === 0) {
    console.log(`  No ${label} data.`);
    return;
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p10 = percentile(sorted, 0.1);
  const p90 = percentile(sorted, 0.9);

  console.log(
    `  n=${sorted.length}  min=${min}  max=${max}  mean=${mean.toFixed(1)}  p10=${p10}  p90=${p90}`
  );

  const buckets = new Map<number, number>();
  for (const v of sorted) {
    const b = v >= 100 ? 90 : Math.floor(v / 10) * 10;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  for (let b = 0; b <= 90; b += 10) {
    const count = buckets.get(b) ?? 0;
    const bar = "#".repeat(Math.min(count, 60));
    console.log(`    ${String(b).padStart(3)}-${b + 9}: ${String(count).padStart(4)} ${bar}`);
  }
}

function printEventInfo(eventId: string, code: string, password: string) {
  console.log("");
  console.log("┌────────────────────────────────────────────────────────┐");
  console.log(`│  Event ID   : ${eventId}`);
  console.log(`│  Event code : ${code}`);
  console.log(`│  Admin pass : ${password}`);
  console.log(`│  Admin URL  : ${APP_URL}/admin`);
  console.log("└────────────────────────────────────────────────────────┘");
  console.log("");
}

// ─── cleanup ────────────────────────────────────────────────────────────────

async function deleteEventAndParticipants(id: string, code: string): Promise<void> {
  const { error: pErr } = await supabase
    .from("participants")
    .delete()
    .eq("event_id", id);
  if (pErr) {
    console.error(`  ✗ Failed to delete participants for event ${code} (${id}):`, pErr.message);
    return;
  }
  const { error: eErr } = await supabase
    .from("events")
    .delete()
    .eq("id", id);
  if (eErr) {
    console.error(`  ✗ Failed to delete event ${code} (${id}):`, eErr.message);
    return;
  }
  console.log(`  ✓ Deleted event ${code} (${id}) and its participants`);
}

async function cleanup() {
  console.log("\n=== Cleanup mode ===");

  // Find MOCK300
  const { data: mock300Events } = await supabase
    .from("events")
    .select("id, code, name")
    .eq("code", EVENT_CODE);

  // Find LOADXX* (any prefix match) + exact stale codes
  const { data: staleExact } = await supabase
    .from("events")
    .select("id, code, name")
    .in("code", STALE_EXACT_CODES);

  // Find LOADXX* prefix via ilike
  const { data: stalePrefix } = await supabase
    .from("events")
    .select("id, code, name")
    .ilike("code", "LOADXX%");

  const allTargets = new Map<string, { id: string; code: string; name: string }>();
  for (const ev of [...(mock300Events ?? []), ...(staleExact ?? []), ...(stalePrefix ?? [])]) {
    allTargets.set(ev.id, ev);
  }

  if (allTargets.size === 0) {
    console.log("Nothing to clean up — no MOCK300 or LOADXX* events found.");
    return;
  }

  console.log(`\nTargets to delete (${allTargets.size}):`);
  for (const { code, name, id } of allTargets.values()) {
    console.log(`  ${code} — "${name}" (${id})`);
  }
  console.log("");

  for (const ev of allTargets.values()) {
    await deleteEventAndParticipants(ev.id, ev.code);
  }

  console.log("\nCleanup complete.");
}

// ─── main test run ───────────────────────────────────────────────────────────

async function run() {
  // ── Step 1: verify questions ────────────────────────────────────────────
  const { data: questionsRaw, error: qErr } = await supabase
    .from("questions")
    .select("id, question, category, options, is_ordinal, match_key")
    .eq("is_active", true)
    .order("question");

  if (qErr) { console.error("FATAL: could not fetch questions:", qErr.message); process.exit(1); }
  if (!questionsRaw?.length) { console.error("FATAL: no active questions in the live table."); process.exit(1); }

  const questions = questionsRaw as LiveQuestion[];

  console.log(`\n=== Live question set (${questions.length} questions) ===`);
  for (const q of questions) {
    const flags = [
      q.is_ordinal ? "ordinal" : null,
      q.match_key ? `match_key=${q.match_key}` : null,
    ].filter(Boolean).join(", ");
    console.log(`  [${q.category ?? "no-cat"}]${flags ? ` (${flags})` : ""} "${q.question}"`);
    console.log(`    options (${q.options.length}): ${q.options.join(" | ")}`);
  }

  const alignmentQs = questions.filter((q) => ALIGNMENT_CATEGORIES.includes(q.category ?? ""));
  const complementQs = questions.filter(
    (q) => COMPLEMENT_CATEGORIES.includes(q.category ?? "") && !q.match_key
  );
  console.log(
    `\n  Alignment-scored: ${alignmentQs.length} (${alignmentQs.map((q) => q.category).join(", ")})`
  );
  console.log(
    `  Complement-scored: ${complementQs.length} (excl. match_key pairs)`
  );

  // Build questionConfigs map for local recompute later
  const questionConfigs = new Map<string, QuestionConfig>();
  for (const q of questions) {
    const category = q.category ?? "neutral";
    let type: "alignment" | "complement" | "neutral" = "neutral";
    if (ALIGNMENT_CATEGORIES.includes(category)) type = "alignment";
    else if (COMPLEMENT_CATEGORIES.includes(category)) type = "complement";
    questionConfigs.set(q.id, {
      question: q.question,
      category,
      type,
      options: q.options,
      is_ordinal: q.is_ordinal,
      match_key: q.match_key,
    });
  }

  // ── Step 2: check MOCK300 doesn't already exist ──────────────────────────
  const { data: existing } = await supabase
    .from("events")
    .select("id, code, name")
    .eq("code", EVENT_CODE)
    .maybeSingle();

  if (existing) {
    console.error(
      `\nFATAL: An event with code ${EVENT_CODE} already exists.\n` +
      `  id: ${existing.id}\n  name: ${existing.name}\n` +
      `Run with --cleanup to remove it first.`
    );
    process.exit(1);
  }

  // ── Step 3: create the event ─────────────────────────────────────────────
  // admin_password is inserted as plain text; a DB trigger (hash_admin_password_trigger)
  // bcrypt-hashes it via extensions.crypt() before the row is committed.
  const { data: event, error: evErr } = await supabase
    .from("events")
    .insert({
      name: EVENT_NAME,
      code: EVENT_CODE,
      age_range: AGE_RANGE,
      status: "waiting",
      admin_password: ADMIN_PASSWORD,
    })
    .select()
    .single();

  if (evErr) { console.error("FATAL: failed to create event:", evErr.message); process.exit(1); }

  console.log(`\n=== Event created ===`);
  printEventInfo(event.id, event.code, ADMIN_PASSWORD);

  // ── Step 4: generate and insert participants ─────────────────────────────
  const defs = generateDefs();

  const genderCounts: Record<string, number> = {};
  const showMeSignature: Record<string, number> = {};
  for (const d of defs) {
    genderCounts[d.gender] = (genderCounts[d.gender] ?? 0) + 1;
    const sig = d.show_me.sort().join("+");
    showMeSignature[sig] = (showMeSignature[sig] ?? 0) + 1;
  }

  console.log(`=== Generating ${TOTAL} participants ===`);
  console.log(
    `  Gender: ${Object.entries(genderCounts)
      .map(([g, n]) => `${g}=${n}`)
      .join("  ")}`
  );
  const restrictive = defs.filter(
    (d) => d.show_me.length === 1 && !d.show_me.includes("Everyone")
  );
  console.log(
    `  Restrictive show_me (single-gender, not Everyone): ${restrictive.length}/${TOTAL} ` +
    `(${((restrictive.length / TOTAL) * 100).toFixed(1)}%)`
  );
  const ageCounts: Record<number, number> = {};
  for (const d of defs) ageCounts[d.age] = (ageCounts[d.age] ?? 0) + 1;
  console.log(
    `  Age distribution: ${Object.entries(ageCounts)
      .sort(([a], [b]) => +a - +b)
      .map(([age, n]) => `${age}:${n}`)
      .join("  ")}`
  );

  const rows = defs.map((def, i) => ({
    event_id: event.id,
    session_token: randomUUID(),
    name: def.name,
    age: def.age,
    city: "Test City",
    gender: def.gender,
    orientation: def.orientation,
    show_me: def.show_me,
    hobbies: def.hobbies,
    answers: generateAnswers(questions, i % NUM_PERSONAS),
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("participants")
    .insert(rows)
    .select("id");

  if (insErr) {
    console.error("FATAL: participant insert failed:", insErr.message);
    await deleteEventAndParticipants(event.id, EVENT_CODE);
    process.exit(1);
  }
  console.log(`  Inserted ${inserted?.length ?? 0} participants ✓`);

  // ── Step 5: invoke run-matching and time it ──────────────────────────────
  console.log(`\n=== Invoking run-matching edge function ===`);
  const t0 = Date.now();

  const { data: fnData, error: fnErr } = await supabase.functions.invoke("run-matching", {
    body: { eventId: event.id, adminPassword: ADMIN_PASSWORD },
  });

  const wallMs = Date.now() - t0;
  const wallSec = (wallMs / 1000).toFixed(2);

  if (fnErr) {
    const msg = String((fnErr as { message?: string }).message ?? fnErr);
    const timedOut = /timeout|cpu|execution time|limit/i.test(msg);
    console.error(`\nrun-matching FAILED after ${wallSec}s${timedOut ? " (likely timeout/CPU limit)" : ""}:`);
    console.error(" ", msg);

    // Try to get the JSON body for more detail
    const ctx = (fnErr as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try { console.error("  response body:", await ctx.json()); } catch { /* ignore */ }
    }

    console.error(`\nEvent ${EVENT_CODE} (${event.id}) and its participants are still in the DB.`);
    console.error("Run with --cleanup to remove them.");
    process.exit(1);
  }

  const timedOutWarning =
    fnData && typeof fnData === "object" && "error" in fnData
      ? ` WARNING: function returned error body: ${JSON.stringify(fnData)}`
      : "";
  console.log(
    `  Wall clock: ${wallSec}s${wallMs < 150_000 ? " ✓ (under 150s limit)" : " ⚠ SLOW"}${timedOutWarning}`
  );
  if (fnData) console.log(`  Response: ${JSON.stringify(fnData)}`);

  // ── Step 6: fetch results ────────────────────────────────────────────────
  const { data: resultsRaw, error: resErr } = await supabase
    .from("participants")
    .select(
      "id, name, age, gender, show_me, orientation, hobbies, answers, matched_to, compatibility_score, compatibility_badge"
    )
    .eq("event_id", event.id);

  if (resErr) { console.error("FATAL: could not read results:", resErr.message); process.exit(1); }

  type ResultRow = ScoringParticipant & {
    show_me: string[];
    compatibility_score: number | null;
    compatibility_badge: string | null;
  };

  const results = resultsRaw as ResultRow[];
  const byId = new Map(results.map((r) => [r.id, r]));
  const matched = results.filter((r) => r.matched_to !== null);
  const unmatched = results.filter((r) => r.matched_to === null);

  // ── Step 7: symmetry verification ───────────────────────────────────────
  const symmetryViolations: string[] = [];
  const selfMatches: string[] = [];

  for (const p of matched) {
    if (p.matched_to === p.id) {
      selfMatches.push(`${p.name} (${p.id}) is matched to itself`);
      continue;
    }
    const partner = byId.get(p.matched_to!);
    if (!partner) {
      symmetryViolations.push(
        `${p.name} (${p.id}) → matched_to ${p.matched_to} which is NOT in this event`
      );
      continue;
    }
    if (partner.matched_to !== p.id) {
      symmetryViolations.push(
        `${p.name} → ${partner.name} but partner's matched_to is ${partner.matched_to ?? "null"}`
      );
    }
  }

  // ── Step 8: report ───────────────────────────────────────────────────────
  console.log(`\n\n########## LOAD TEST REPORT ##########`);

  console.log(`\n─── (a) Timing ───`);
  console.log(`  Wall clock: ${wallSec}s`);
  console.log(
    wallMs < 150_000
      ? "  Edge function completed within the 150s limit ✓"
      : "  ⚠ Wall clock exceeded 150s — check for a CPU/timeout kill"
  );

  console.log(`\n─── (b) Match counts ───`);
  console.log(`  Participants  : ${results.length}`);
  console.log(`  Matched       : ${matched.length}  (${matched.length / 2} pairs)`);
  console.log(`  Unmatched     : ${unmatched.length}`);
  console.log(`  Match rate    : ${((matched.length / results.length) * 100).toFixed(1)}%`);

  console.log(`\n─── (c) Symmetry and self-match checks ───`);
  if (selfMatches.length === 0 && symmetryViolations.length === 0) {
    console.log("  All matched pairs are symmetric and nobody is matched to themselves ✓");
  } else {
    for (const v of selfMatches) console.error(`  SELF-MATCH: ${v}`);
    for (const v of symmetryViolations) console.error(`  ASYMMETRY: ${v}`);
  }

  console.log(`\n─── (d) TRUE compatibility score distribution ───`);
  const trueScores = matched
    .map((m) => m.compatibility_score)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  printDistribution(trueScores, "true score");

  console.log(`\n─── (e) DISPLAYED score distribution ───`);
  const displayedScores = trueScores.map(displayScore).sort((a, b) => a - b);
  printDistribution(displayedScores, "displayed score");
  const belowFloor = displayedScores.filter((s) => s < 85);
  console.log(
    belowFloor.length === 0
      ? "  Confirmed: every displayed score is ≥ 85 ✓"
      : `  ⚠ ${belowFloor.length} displayed scores are below 85`
  );

  console.log(`\n─── (f) Unmatched analysis ───`);
  if (unmatched.length === 0) {
    console.log("  None unmatched ✓");
  } else {
    let hardFilterKills = 0;
    let poolScarcity = 0;

    for (const u of unmatched) {
      // Count how many people in the full pool (matched or not) pass both hard filters
      const eligibleCount = results.filter((other) => {
        if (other.id === u.id) return false;
        if (Math.abs(other.age - u.age) > AGE_RANGE) return false;
        return orientationCompatible(u, other);
      }).length;

      if (eligibleCount === 0) {
        hardFilterKills++;
        console.log(
          `  [HARD FILTER] ${u.name} — age ${u.age}, ${u.gender}, show_me=[${u.show_me.join(",")}] — 0 eligible in pool`
        );
      } else {
        poolScarcity++;
        // How many of those eligible are matched to someone else vs. also unmatched
        const eligibleAlsoUnmatched = results.filter((other) => {
          if (other.id === u.id || other.matched_to !== null) return false;
          if (Math.abs(other.age - u.age) > AGE_RANGE) return false;
          return orientationCompatible(u, other);
        }).length;
        console.log(
          `  [SCARCITY]    ${u.name} — age ${u.age}, ${u.gender}, show_me=[${u.show_me.join(",")}] — ` +
          `${eligibleCount} eligible in pool (${eligibleAlsoUnmatched} also unmatched)`
        );
      }
    }

    console.log("");
    console.log(`  Hard-filter kills (no eligible partner at all) : ${hardFilterKills}`);
    console.log(`  Pool scarcity (eligible but all paired away)   : ${poolScarcity}`);
  }

  console.log(`\n─── (g) Local recompute vs. persisted score sanity check ───`);
  const warnCaptures: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnCaptures.push(args); };

  const seenPairs = new Set<string>();
  const mismatches: { names: string; persisted: number | null; local: number }[] = [];

  try {
    for (const p of matched) {
      const key = [p.id, p.matched_to].sort().join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const partner = byId.get(p.matched_to!);
      if (!partner) continue;
      const local = calculateCompatibility(p, partner, AGE_RANGE, questionConfigs);
      if (p.compatibility_score !== null && p.compatibility_score !== local.score) {
        mismatches.push({
          names: `${p.name} <-> ${partner.name}`,
          persisted: p.compatibility_score,
          local: local.score,
        });
      }
    }
  } finally {
    console.warn = originalWarn;
  }

  const pairCount = seenPairs.size;
  console.log(
    `  ${pairCount} pairs recomputed locally. ${mismatches.length} disagree with persisted score.`
  );
  if (mismatches.length > 0) {
    console.log(
      "  ⚠ Deployed edge function may not match local scoring.ts (stale deploy?)."
    );
    for (const m of mismatches.slice(0, 5)) {
      console.log(`    ${m.names}: persisted=${m.persisted}, local=${m.local}`);
    }
  } else {
    console.log("  Local scoring.ts matches the deployed edge function ✓");
  }

  if (warnCaptures.length > 0) {
    console.log(`\n─── (h) getAnswerDistance warnings during local recompute ───`);
    console.log(`  ${warnCaptures.length} warning(s):`);
    for (const w of warnCaptures.slice(0, 5)) console.log("   ", ...w);
  }

  // ── Final event info (printed again so it's not buried) ─────────────────
  console.log(`\n########## EVENT INFO (repeat) ##########`);
  printEventInfo(event.id, event.code, ADMIN_PASSWORD);
  console.log(
    `Participants and event are still in the database.\n` +
    `Run with --cleanup to remove them when you're done inspecting.`
  );
}

// ─── entry point ─────────────────────────────────────────────────────────────

async function main() {
  if (CLEANUP_ONLY) {
    await cleanup();
  } else {
    await run();
  }
}

main().catch((err) => {
  console.error("\nLoad test failed:", err);
  process.exit(1);
});
