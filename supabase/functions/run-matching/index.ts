import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Participant {
  id: string;
  event_id: string;
  name: string;
  age: number;
  gender: string;
  orientation: string;
  show_me: string[];
  hobbies: string[];
  answers: { question_id: string; answer: string }[];
  matched_to: string | null;
}

const COMPATIBILITY_BADGES = [
  "Cancel your backup plans 💕",
  "Two weirds = one normal 🌟",
  "Plot twist energy ✨",
  "Main character vibes together 🎬",
  "Your algorithm matched 🤖❤️",
  "Stars aligned for you two ⭐",
  "Chemistry loading... complete! 🧪",
  "Meant to swipe right 💫",
];

function checkOrientationCompatibility(p1: Participant, p2: Participant): boolean {
  const genderMap: Record<string, string> = {
    "Man": "Men",
    "Woman": "Women",
    "Non-binary": "Everyone",
    "Other": "Everyone",
  };

  const p1Gender = genderMap[p1.gender] || "Everyone";
  const p2Gender = genderMap[p2.gender] || "Everyone";

  const p1WantsP2 = p1.show_me.includes(p2Gender) || p1.show_me.includes("Everyone");
  const p2WantsP1 = p2.show_me.includes(p1Gender) || p2.show_me.includes("Everyone");

  return p1WantsP2 && p2WantsP1;
}

function calculateCompatibility(p1: Participant, p2: Participant, ageRange: number): number {
  // Age check
  if (Math.abs(p1.age - p2.age) > ageRange) return 0;

  // Orientation check
  if (!checkOrientationCompatibility(p1, p2)) return 0;

  let score = 0;

  // MCQ similarity (40%)
  const p1Answers = new Map(p1.answers.map(a => [a.question_id, a.answer]));
  const p2Answers = new Map(p2.answers.map(a => [a.question_id, a.answer]));
  let matchingAnswers = 0;
  let totalQuestions = 0;

  p1Answers.forEach((answer, qId) => {
    if (p2Answers.has(qId)) {
      totalQuestions++;
      if (p2Answers.get(qId) === answer) matchingAnswers++;
    }
  });

  if (totalQuestions > 0) {
    score += (matchingAnswers / totalQuestions) * 40;
  }

  // Hobbies overlap (30%)
  const commonHobbies = p1.hobbies.filter(h => p2.hobbies.includes(h));
  const maxHobbies = Math.max(p1.hobbies.length, p2.hobbies.length, 1);
  score += (commonHobbies.length / maxHobbies) * 30;

  // Base compatibility bonus (30%)
  score += 30;

  return Math.round(Math.min(score, 100));
}

function generateBadge(score: number): string {
  const prefix = score >= 80 ? `${score}% — ` : "";
  const badge = COMPATIBILITY_BADGES[Math.floor(Math.random() * COMPATIBILITY_BADGES.length)];
  return prefix + badge;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { eventId } = await req.json();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    // Get all participants
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("*")
      .eq("event_id", eventId)
      .is("matched_to", null);

    if (participantsError) throw participantsError;

    console.log(`Matching ${participants?.length || 0} participants for event ${eventId}`);

    const unmatched = [...(participants || [])] as Participant[];
    const matches: { id: string; matchId: string; score: number }[] = [];

    // Calculate all compatibility scores
    const scores: { p1: string; p2: string; score: number }[] = [];

    for (let i = 0; i < unmatched.length; i++) {
      for (let j = i + 1; j < unmatched.length; j++) {
        const score = calculateCompatibility(unmatched[i], unmatched[j], event.age_range);
        if (score > 0) {
          scores.push({ p1: unmatched[i].id, p2: unmatched[j].id, score });
        }
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Greedy matching
    const matched = new Set<string>();

    for (const { p1, p2, score } of scores) {
      if (!matched.has(p1) && !matched.has(p2)) {
        matches.push({ id: p1, matchId: p2, score });
        matches.push({ id: p2, matchId: p1, score });
        matched.add(p1);
        matched.add(p2);
      }
    }

    // Update participants with matches
    for (const match of matches) {
      const badge = generateBadge(match.score);
      await supabase
        .from("participants")
        .update({
          matched_to: match.matchId,
          compatibility_score: match.score,
          compatibility_badge: badge,
        })
        .eq("id", match.id);
    }

    // Update event status to revealed
    await supabase
      .from("events")
      .update({ status: "revealed" })
      .eq("id", eventId);

    console.log(`Matched ${matches.length / 2} pairs`);

    return new Response(
      JSON.stringify({ success: true, matchedPairs: matches.length / 2 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Matching error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
