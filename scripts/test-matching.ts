// THROWAWAY test script. Not part of the app build. Creates a dummy event
// (code TESTZZ) and 8 fake participants, invokes the live run-matching edge
// function against it, and prints the results. Does NOT clean up afterward.
//
// Usage: npx tsx scripts/test-matching.ts

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { displayScore } from "../src/lib/score.ts";

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
  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id, question, category, options, is_ordinal, match_key, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (qError) throw qError;
  if (!questions || questions.length === 0) {
    throw new Error("No active questions found — cannot build test answers");
  }

  const liveQuestions = questions as LiveQuestion[];

  console.log(`\n=== Live question set (${liveQuestions.length} questions) ===`);
  for (const q of liveQuestions) {
    console.log(
      `${q.sort_order}. [${q.category ?? "no-category"}]${q.is_ordinal ? " (ordinal)" : ""}${
        q.match_key ? ` (match_key=${q.match_key})` : ""
      } ${q.question}`
    );
    console.log(`   options: ${q.options.join(" | ")}`);
  }

  const byText = new Map(liveQuestions.map((q) => [q.question, q]));

  const conflictQuestion = liveQuestions.find(
    (q) =>
      q.options.includes("Talk it out immediately") &&
      q.options.includes("Avoid conflict if possible")
  );
  if (!conflictQuestion) {
    throw new Error(
      "Live question set has no question with both 'Talk it out immediately' and " +
        "'Avoid conflict if possible' options — cannot build the opposed-conflict pair"
    );
  }

  const givingQuestion = liveQuestions.find((q) => q.match_key === "love_giving");
  const receivingQuestion = liveQuestions.find((q) => q.match_key === "love_receiving");
  if (!givingQuestion || !receivingQuestion) {
    throw new Error("Live question set has no love_giving/love_receiving match_key pair");
  }
  const sharedLoveLanguage = givingQuestion.options.find((o) =>
    receivingQuestion.options.includes(o)
  );
  if (!sharedLoveLanguage) {
    throw new Error("giving/receiving love-language questions share no common option string");
  }

  // ── Step 2: create a dummy event ─────────────────────────────────────────
  const adminPassword = `zz-throwaway-${randomUUID().slice(0, 8)}`;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      name: "ZZ THROWAWAY TEST EVENT — DO NOT USE",
      code: "TESTZZ",
      age_range: 10,
      admin_password: adminPassword,
      status: "waiting",
    })
    .select()
    .single();

  if (eventError) throw eventError;

  console.log(`\n=== Dummy event created ===`);
  console.log(`id: ${event.id}, code: ${event.code}, name: ${event.name}`);

  // ── Step 3: insert 8 fake participants with varied answers ──────────────
  type Def = {
    name: string;
    age: number;
    gender: string;
    orientation: string;
    show_me: string[];
    hobbies: string[];
    overrides?: Record<string, string>; // question text -> forced answer
  };

  const defs: Def[] = [
    {
      name: "ZZ-Alex",
      age: 24,
      gender: "Woman",
      orientation: "Straight",
      show_me: ["Everyone"],
      hobbies: ["Reading", "Coffee"],
      overrides: { [conflictQuestion.question]: "Talk it out immediately" },
    },
    {
      name: "ZZ-Sam",
      age: 25,
      gender: "Man",
      orientation: "Straight",
      show_me: ["Everyone"],
      hobbies: ["Gaming", "Fitness"],
      overrides: { [conflictQuestion.question]: "Avoid conflict if possible" },
    },
    {
      name: "ZZ-Jordan",
      age: 26,
      gender: "Non-binary", // the non-binary participant
      orientation: "Bisexual",
      show_me: ["Everyone"],
      hobbies: ["Art", "Music"],
    },
    {
      name: "ZZ-Riley",
      age: 27,
      gender: "Man",
      orientation: "Bisexual",
      show_me: ["Everyone", "Non-binary"], // show_me includes "Non-binary"
      hobbies: ["Reading", "Travel"],
    },
    {
      name: "ZZ-Taylor",
      age: 24,
      gender: "Woman",
      orientation: "Bisexual",
      show_me: ["Everyone"],
      hobbies: ["Cooking", "Yoga"],
      overrides: { [givingQuestion.question]: sharedLoveLanguage },
    },
    {
      name: "ZZ-Morgan",
      age: 25,
      gender: "Man",
      orientation: "Straight",
      show_me: ["Everyone"],
      hobbies: ["Sports", "Movies"],
      overrides: { [receivingQuestion.question]: sharedLoveLanguage },
    },
    {
      name: "ZZ-Casey",
      age: 26,
      gender: "Woman",
      orientation: "Straight",
      show_me: ["Everyone"],
      hobbies: ["Photography", "Hiking"],
    },
    {
      name: "ZZ-Drew",
      age: 27,
      gender: "Man",
      orientation: "Straight",
      show_me: ["Everyone"],
      hobbies: ["Tech", "Anime"],
    },
  ];

  const rows = defs.map((def, pIndex) => {
    const answers = liveQuestions.map((q, qIndex) => {
      const forced = def.overrides?.[q.question];
      const answer = forced ?? q.options[(pIndex + qIndex) % q.options.length];
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

  const { data: participants, error: pError } = await supabase
    .from("participants")
    .insert(rows)
    .select("id, name, gender, show_me");

  if (pError) throw pError;

  console.log(`\n=== Inserted ${participants.length} fake participants ===`);
  for (const p of participants) {
    console.log(`${p.name} (${p.id}) — gender: ${p.gender}, show_me: ${p.show_me.join(", ")}`);
  }

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

  // ── Step 5: print results table ──────────────────────────────────────────
  const { data: results, error: rError } = await supabase
    .from("participants")
    .select("id, name, gender, matched_to, compatibility_score, compatibility_badge")
    .eq("event_id", event.id)
    .order("name", { ascending: true });

  if (rError) throw rError;

  const nameById = new Map(results.map((r) => [r.id, r.name]));

  console.log(`\n=== Match results ===`);
  const table = results.map((r) => ({
    participant: r.name,
    gender: r.gender,
    matched_to: r.matched_to ? nameById.get(r.matched_to) ?? r.matched_to : "(unmatched)",
    true_score: r.compatibility_score ?? "-",
    displayed_score:
      r.compatibility_score != null ? `${displayScore(r.compatibility_score)}%` : "-",
    reveal_text: r.compatibility_badge ?? "-",
  }));

  console.table(table);

  console.log(`\nDummy event NOT deleted. code=TESTZZ id=${event.id}`);
}

main().catch((err) => {
  console.error("\nTest script failed:", err);
  process.exitCode = 1;
});
