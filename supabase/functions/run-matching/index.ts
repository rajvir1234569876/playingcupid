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

interface QuestionConfig {
  category: string;
  type: "alignment" | "complement" | "neutral";
  options: string[];
}

// Question categories and their scoring behavior
// ALIGNMENT: Similar answers = good, opposite = rejection
// COMPLEMENT: Moderate difference = bonus, same = neutral, extreme opposite = penalty
// NEUTRAL: No effect on score, used for explanations only

const ALIGNMENT_CATEGORIES = [
  "relationship",      // Relationship preferences
  "emotional_depth",   // Emotional openness & depth
  "conflict",          // Conflict handling
  "values",            // Core life values & priorities
];

const COMPLEMENT_CATEGORIES = [
  "personality",       // Energy, style, approach
  "communication",     // Communication style
  "connection",        // Connection preferences
];

const NEUTRAL_CATEGORIES = [
  "lifestyle",         // Travel, pets, weekend - flavor only
  "dating",            // First date preferences - flavor
];

// Explanation templates for alignment insights
const ALIGNMENT_INSIGHTS = [
  "You share core emotional values",
  "Your relationship priorities align beautifully",
  "You value the same things in connection",
  "Your emotional depth resonates together",
  "You both approach trust similarly",
  "Your conflict styles are compatible",
];

// Explanation templates for complement insights
const COMPLEMENT_INSIGHTS = [
  "while bringing different energies to the table",
  "and balance each other's social style",
  "with complementary communication approaches",
  "while offering different perspectives",
  "and your personalities create balance",
  "with energies that complement each other",
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

// Calculate "distance" between answers (0 = same option, 1 = adjacent, etc.)
function getAnswerDistance(answer1: string, answer2: string, options: string[]): number {
  const idx1 = options.indexOf(answer1);
  const idx2 = options.indexOf(answer2);
  if (idx1 === -1 || idx2 === -1) return 2; // Unknown answers treated as moderate distance
  return Math.abs(idx1 - idx2);
}

// Score alignment questions - similarity is preferred
function scoreAlignment(distance: number, maxDistance: number): { score: number; rejected: boolean } {
  if (distance === 0) {
    // Same answer = perfect alignment
    return { score: 1.0, rejected: false };
  } else if (distance === 1) {
    // Adjacent answer = good alignment
    return { score: 0.7, rejected: false };
  } else if (distance === 2) {
    // Moderate distance = acceptable
    return { score: 0.3, rejected: false };
  } else {
    // Extreme difference = rejection for values
    return { score: 0, rejected: true };
  }
}

// Score complement questions - moderate difference is preferred
function scoreComplement(distance: number, maxDistance: number): number {
  if (distance === 0) {
    // Same = neutral (not bad, not bonus)
    return 0.5;
  } else if (distance === 1) {
    // Slight difference = good balance
    return 0.9;
  } else if (distance === 2) {
    // Moderate difference = ideal complement
    return 1.0;
  } else {
    // Extreme opposite = slight penalty (too different)
    return 0.3;
  }
}

interface CompatibilityResult {
  score: number;
  alignmentScore: number;
  complementScore: number;
  rejected: boolean;
  alignmentInsight: string;
  complementInsight: string;
  commonHobbies: string[];
}

function calculateCompatibility(
  p1: Participant,
  p2: Participant,
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): CompatibilityResult {
  const defaultResult: CompatibilityResult = {
    score: 0,
    alignmentScore: 0,
    complementScore: 0,
    rejected: true,
    alignmentInsight: "",
    complementInsight: "",
    commonHobbies: [],
  };

  // STEP 1: Hard filters (non-negotiable)
  if (Math.abs(p1.age - p2.age) > ageRange) return defaultResult;
  if (!checkOrientationCompatibility(p1, p2)) return defaultResult;

  const p1Answers = new Map(p1.answers.map((a) => [a.question_id, a.answer]));
  const p2Answers = new Map(p2.answers.map((a) => [a.question_id, a.answer]));

  // STEP 2: Alignment check (must match on values)
  let alignmentTotal = 0;
  let alignmentSum = 0;
  let alignmentRejected = false;
  let bestAlignmentCategory = "";
  let bestAlignmentScore = 0;

  for (const [questionId, config] of questionConfigs) {
    if (!ALIGNMENT_CATEGORIES.includes(config.category)) continue;

    const ans1 = p1Answers.get(questionId);
    const ans2 = p2Answers.get(questionId);
    if (!ans1 || !ans2) continue;

    const distance = getAnswerDistance(ans1, ans2, config.options);
    const maxDistance = config.options.length - 1;
    const result = scoreAlignment(distance, maxDistance);

    alignmentTotal++;
    alignmentSum += result.score;

    if (result.rejected) {
      alignmentRejected = true;
    }

    if (result.score > bestAlignmentScore) {
      bestAlignmentScore = result.score;
      bestAlignmentCategory = config.category;
    }
  }

  // Calculate alignment percentage
  const alignmentScore = alignmentTotal > 0 ? alignmentSum / alignmentTotal : 0;

  // If alignment is below 50% threshold, reject the match
  if (alignmentScore < 0.5 || alignmentRejected) {
    return defaultResult;
  }

  // STEP 3: Complement check (balance preferred)
  let complementTotal = 0;
  let complementSum = 0;
  let bestComplementCategory = "";
  let bestComplementScore = 0;

  for (const [questionId, config] of questionConfigs) {
    if (!COMPLEMENT_CATEGORIES.includes(config.category)) continue;

    const ans1 = p1Answers.get(questionId);
    const ans2 = p2Answers.get(questionId);
    if (!ans1 || !ans2) continue;

    const distance = getAnswerDistance(ans1, ans2, config.options);
    const maxDistance = config.options.length - 1;
    const score = scoreComplement(distance, maxDistance);

    complementTotal++;
    complementSum += score;

    if (score > bestComplementScore) {
      bestComplementScore = score;
      bestComplementCategory = config.category;
    }
  }

  const complementScore = complementTotal > 0 ? complementSum / complementTotal : 0.5;

  // STEP 4: Calculate common hobbies (for display only)
  const commonHobbies = p1.hobbies.filter((h) => p2.hobbies.includes(h));

  // STEP 5: Final score calculation
  // Alignment: 55% weight (most important)
  // Complement: 30% weight (balance)
  // Hobby overlap: 10% weight (shared interests)
  // Base compatibility: 5% (everyone gets some baseline)
  
  const hobbyScore = commonHobbies.length > 0 
    ? Math.min(commonHobbies.length / 3, 1) 
    : 0;

  const finalScore = Math.round(
    alignmentScore * 55 +
    complementScore * 30 +
    hobbyScore * 10 +
    5 // base
  );

  // Generate insights based on best matches
  const alignmentInsight = ALIGNMENT_INSIGHTS[
    Math.floor(Math.random() * ALIGNMENT_INSIGHTS.length)
  ];
  const complementInsight = COMPLEMENT_INSIGHTS[
    Math.floor(Math.random() * COMPLEMENT_INSIGHTS.length)
  ];

  return {
    score: Math.min(finalScore, 100),
    alignmentScore,
    complementScore,
    rejected: false,
    alignmentInsight,
    complementInsight,
    commonHobbies,
  };
}

function generateBadge(result: CompatibilityResult): string {
  // Generate a meaningful explanation from alignment + complement insights
  return `${result.alignmentInsight} ${result.complementInsight}.`;
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

    // Get questions with categories and options
    const { data: questions } = await supabase
      .from("questions")
      .select("id, category, options")
      .eq("is_active", true);

    const questionConfigs = new Map<string, QuestionConfig>();
    if (questions) {
      questions.forEach((q: { id: string; category: string | null; options: string[] }) => {
        const category = q.category || "neutral";
        let type: "alignment" | "complement" | "neutral" = "neutral";
        
        if (ALIGNMENT_CATEGORIES.includes(category)) {
          type = "alignment";
        } else if (COMPLEMENT_CATEGORIES.includes(category)) {
          type = "complement";
        }
        
        questionConfigs.set(q.id, {
          category,
          type,
          options: q.options || [],
        });
      });
    }

    // Get all unmatched participants
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("*")
      .eq("event_id", eventId)
      .is("matched_to", null);

    if (participantsError) throw participantsError;

    console.log(`Matching ${participants?.length || 0} participants for event ${eventId}`);

    const unmatched = [...(participants || [])] as Participant[];
    const matches: { id: string; matchId: string; score: number; badge: string }[] = [];

    // Calculate all compatibility scores
    const scores: { 
      p1: string; 
      p2: string; 
      result: CompatibilityResult;
    }[] = [];

    for (let i = 0; i < unmatched.length; i++) {
      for (let j = i + 1; j < unmatched.length; j++) {
        const result = calculateCompatibility(
          unmatched[i],
          unmatched[j],
          event.age_range,
          questionConfigs
        );
        
        if (!result.rejected && result.score > 0) {
          scores.push({ 
            p1: unmatched[i].id, 
            p2: unmatched[j].id, 
            result 
          });
        }
      }
    }

    // Sort by score descending (best matches first)
    scores.sort((a, b) => b.result.score - a.result.score);

    // Greedy matching - assign highest mutual compatibility first
    const matched = new Set<string>();

    for (const { p1, p2, result } of scores) {
      if (!matched.has(p1) && !matched.has(p2)) {
        const badge = generateBadge(result);
        matches.push({ id: p1, matchId: p2, score: result.score, badge });
        matches.push({ id: p2, matchId: p1, score: result.score, badge });
        matched.add(p1);
        matched.add(p2);
      }
    }

    // Update participants with matches
    for (const match of matches) {
      await supabase
        .from("participants")
        .update({
          matched_to: match.matchId,
          compatibility_score: match.score,
          compatibility_badge: match.badge,
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
