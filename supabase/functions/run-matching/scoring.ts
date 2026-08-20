// Pure compatibility scoring logic for the matching algorithm.
// Kept free of Deno-only APIs and remote imports so it can be unit tested
// directly (see src/test/matching.test.ts) without spinning up the edge
// function's Deno.serve handler.

export interface Participant {
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

export interface QuestionConfig {
  question: string;
  category: string;
  type: "alignment" | "complement" | "neutral";
  options: string[];
  is_ordinal: boolean;
  match_key: string | null;
}

// Question categories and their scoring behavior
// ALIGNMENT: Similar answers = good
// COMPLEMENT: Moderate difference = bonus, same = neutral, extreme opposite = penalty
// NEUTRAL: No effect on score, used for explanations only

export const ALIGNMENT_CATEGORIES = [
  "relationship",      // Relationship preferences
  "emotional_depth",   // Emotional openness & depth
  "conflict",           // Conflict handling
  "values",             // Core life values & priorities
];

export const COMPLEMENT_CATEGORIES = [
  "personality",        // Energy, style, approach
  "communication",       // Communication style
  "connection",           // Connection preferences
];

export const NEUTRAL_CATEGORIES = [
  "lifestyle",           // Travel, pets, weekend - flavor only
  "dating",               // First date preferences - flavor
];

// Insight text keyed by the strongest-scoring category on each axis, so the
// reveal explanation names what actually drove the match instead of being
// picked at random.
const ALIGNMENT_INSIGHTS: Record<string, string> = {
  relationship: "You want the same things out of a relationship",
  emotional_depth: "You connect on the same emotional depth",
  conflict: "You handle disagreements the same way",
  values: "You value the same things in a partner",
};

const COMPLEMENT_INSIGHTS: Record<string, string> = {
  personality: "while your personalities balance each other out",
  communication: "while your communication styles complement each other",
  connection: "while you connect in complementary ways",
};

const DEFAULT_ALIGNMENT_INSIGHT = "You're compatible in meaningful ways";
const DEFAULT_COMPLEMENT_INSIGHT = "while bringing balance to each other";

export function checkOrientationCompatibility(p1: Participant, p2: Participant): boolean {
  const genderMap: Record<string, string> = {
    "Man": "Men",
    "Woman": "Women",
    "Non-binary": "Non-binary",
    "Other": "Non-binary",
  };

  const p1Gender = genderMap[p1.gender] || "Everyone";
  const p2Gender = genderMap[p2.gender] || "Everyone";

  const p1WantsP2 = p1.show_me.includes(p2Gender) || p1.show_me.includes("Everyone");
  const p2WantsP1 = p2.show_me.includes(p1Gender) || p2.show_me.includes("Everyone");

  return p1WantsP2 && p2WantsP1;
}

// Distance between answers on a genuinely ordinal scale (0 = same option).
// Only meaningful when the question's is_ordinal flag is true — option
// order on categorical questions is arbitrary, so index arithmetic there
// would be meaningless.
function getAnswerDistance(
  questionId: string,
  answer1: string,
  answer2: string,
  options: string[]
): number | null {
  const idx1 = options.indexOf(answer1);
  const idx2 = options.indexOf(answer2);
  if (idx1 === -1 || idx2 === -1) {
    console.warn(
      `getAnswerDistance: answer not found in options for question ${questionId}`,
      { answer1, answer2, options }
    );
    return null;
  }
  return Math.abs(idx1 - idx2);
}

// Score ordinal alignment questions - similarity is preferred.
function scoreOrdinalAlignment(distance: number): number {
  if (distance === 0) return 1.0;
  if (distance === 1) return 0.7;
  if (distance === 2) return 0.3;
  return 0.1;
}

// Score ordinal complement questions - moderate difference is preferred.
function scoreOrdinalComplement(distance: number): number {
  if (distance === 0) return 0.5;
  if (distance === 1) return 0.9;
  if (distance === 2) return 1.0;
  return 0.3;
}

type ClusterTier = "exact" | "same" | "different" | "opposed" | "unclustered";

interface QuestionClusters {
  clusters: Record<string, string[]>;
  opposed?: [string, string][];
}

// Option-string clusters for categorical (non-ordinal) questions, keyed by
// the exact question text — NOT category. Multiple questions share a
// category (e.g. "personality" covers energy, social battery, and friend
// group), so keying by category silently applies the wrong question's
// clusters to another question's option strings. Every option string here
// must match the LIVE `questions` table exactly — see
// src/test/fixtures/live-questions-snapshot.json (pulled from the DB) and
// the "cluster options exist in the live question set" test that guards
// against this drifting again. A typo or a trimmed option just fails to
// cluster silently, it doesn't throw.
export const CLUSTER_DEFINITIONS: Record<string, QuestionClusters> = {
  "What's your energy?": {
    clusters: {
      warm: ["Golden Retriever", "Disney Princess"],
      mysterious: ["Black Cat", "Evil Villain"],
      main_character: ["Main Character"],
      comic_relief: ["Comic relief"],
    },
    // No opposed pairs — for a complement question, cross-cluster is good.
  },
  "How do you show you like someone?": {
    clusters: {
      subtle: ["Constant texting/memes", "Playful teasing"],
      intentional: ["Quality time", "Acts of service"],
      intimate: ["Physical affection", "Deep conversations"],
    },
  },
  "How do you handle disagreements?": {
    clusters: {
      engage_now: ["Talk it out immediately"],
      collaborative: ["Try to compromise", "Hear everyone out first"],
      withdraw: ["Need time before talking", "Avoid conflict if possible"],
      deflect: ["Crack jokes to lighten the mood"],
    },
    // Classic pursue-withdraw pattern.
    opposed: [["engage_now", "withdraw"]],
  },
  "Your texting style?": {
    // This question mixes two independent axes — responsiveness and
    // format. Cluster on responsiveness only; format-only options
    // (essays, one-liners, memes/GIFs) stay unclustered and are scored as
    // neutral below.
    clusters: {
      fast: ["Replies instantly"],
      mid: ["Replies within a few hours"],
      slow: ["Accidentally disappears for days"],
    },
    opposed: [["fast", "slow"]],
  },
  "Your friend group would describe you as...": {
    clusters: {
      structured: ["The planner"],
      spontaneous: ["The chaotic one", "The spontaneous one"],
      expressive: ["The funny one"],
      reserved: ["The therapist", "The quiet observer"],
    },
    // No opposed pairs — for a complement question, cross-cluster is good.
  },
  "What's your conversation sweet spot?": {
    clusters: {
      deep: ["Deep life talks", "Philosophy"],
      playful: ["Pop culture", "Memes"],
      curious: ["Science & tech", "Random fun facts"],
    },
    opposed: [["deep", "playful"]],
  },
};

function findCluster(def: QuestionClusters, answer: string): string | null {
  for (const [cluster, options] of Object.entries(def.clusters)) {
    if (options.includes(answer)) return cluster;
  }
  return null;
}

function getClusterTier(question: string, ans1: string, ans2: string): ClusterTier {
  if (ans1 === ans2) return "exact";

  const def = CLUSTER_DEFINITIONS[question];
  if (!def) return "unclustered";

  const c1 = findCluster(def, ans1);
  const c2 = findCluster(def, ans2);
  if (!c1 || !c2) return "unclustered";
  if (c1 === c2) return "same";

  const isOpposed = (def.opposed || []).some(
    ([a, b]) => (a === c1 && b === c2) || (a === c2 && b === c1)
  );
  return isOpposed ? "opposed" : "different";
}

const CATEGORICAL_ALIGNMENT_SCORE: Record<ClusterTier, number> = {
  exact: 1.0,
  same: 0.7,
  different: 0.3,
  opposed: 0.1,
  unclustered: 0.3,
};

const CATEGORICAL_COMPLEMENT_SCORE: Record<ClusterTier, number> = {
  exact: 0.5,
  same: 0.9,
  different: 1.0,
  opposed: 0.3,
  unclustered: 1.0,
};

function scoreCategoricalAlignment(tier: ClusterTier): number {
  return CATEGORICAL_ALIGNMENT_SCORE[tier];
}

function scoreCategoricalComplement(category: string, tier: ClusterTier): number {
  // Format-only differences on the texting-style question shouldn't score
  // as an ideal complement — treat them as neutral instead.
  if (category === "communication" && tier === "unclustered") return 0.5;
  return CATEGORICAL_COMPLEMENT_SCORE[tier];
}

export interface CompatibilityResult {
  score: number;
  alignmentScore: number;
  complementScore: number;
  loveLanguageScore: number;
  rejected: boolean;
  bestAlignmentCategory: string;
  bestComplementCategory: string;
  commonHobbies: string[];
}

export function calculateCompatibility(
  p1: Participant,
  p2: Participant,
  ageRange: number,
  questionConfigs: Map<string, QuestionConfig>
): CompatibilityResult {
  const defaultResult: CompatibilityResult = {
    score: 0,
    alignmentScore: 0,
    complementScore: 0,
    loveLanguageScore: 0,
    rejected: true,
    bestAlignmentCategory: "",
    bestComplementCategory: "",
    commonHobbies: [],
  };

  // STEP 1: Hard filters (non-negotiable). Everything past this point is a
  // ranking signal, not a rejection — at a live event an unmatched person
  // is worse than an imperfect match.
  if (Math.abs(p1.age - p2.age) > ageRange) return defaultResult;
  if (!checkOrientationCompatibility(p1, p2)) return defaultResult;

  const p1Answers = new Map(p1.answers.map((a) => [a.question_id, a.answer]));
  const p2Answers = new Map(p2.answers.map((a) => [a.question_id, a.answer]));

  // STEP 2: Alignment scoring (similarity preferred)
  let alignmentTotal = 0;
  let alignmentSum = 0;
  let bestAlignmentCategory = "";
  let bestAlignmentScore = 0;

  for (const [questionId, config] of questionConfigs) {
    if (!ALIGNMENT_CATEGORIES.includes(config.category)) continue;

    const ans1 = p1Answers.get(questionId);
    const ans2 = p2Answers.get(questionId);
    if (!ans1 || !ans2) continue;

    let score: number;
    if (config.is_ordinal) {
      const distance = getAnswerDistance(questionId, ans1, ans2, config.options);
      if (distance === null) continue;
      score = scoreOrdinalAlignment(distance);
    } else {
      const tier = getClusterTier(config.question, ans1, ans2);
      score = scoreCategoricalAlignment(tier);
    }

    alignmentTotal++;
    alignmentSum += score;

    if (score > bestAlignmentScore) {
      bestAlignmentScore = score;
      bestAlignmentCategory = config.category;
    }
  }

  const alignmentScore = alignmentTotal > 0 ? alignmentSum / alignmentTotal : 0;

  // STEP 3: Complement scoring (moderate difference preferred). Cross-paired
  // questions (match_key set) are scored separately below, not here.
  let complementTotal = 0;
  let complementSum = 0;
  let bestComplementCategory = "";
  let bestComplementScore = 0;

  for (const [questionId, config] of questionConfigs) {
    if (!COMPLEMENT_CATEGORIES.includes(config.category)) continue;
    if (config.match_key) continue;

    const ans1 = p1Answers.get(questionId);
    const ans2 = p2Answers.get(questionId);
    if (!ans1 || !ans2) continue;

    let score: number;
    if (config.is_ordinal) {
      const distance = getAnswerDistance(questionId, ans1, ans2, config.options);
      if (distance === null) continue;
      score = scoreOrdinalComplement(distance);
    } else {
      const tier = getClusterTier(config.question, ans1, ans2);
      score = scoreCategoricalComplement(config.category, tier);
    }

    complementTotal++;
    complementSum += score;

    if (score > bestComplementScore) {
      bestComplementScore = score;
      bestComplementCategory = config.category;
    }
  }

  const complementScore = complementTotal > 0 ? complementSum / complementTotal : 0.5;

  // STEP 4: Cross-question love language scoring. p1's giving answer is
  // compared against p2's receiving answer and vice versa — giving-to-giving
  // is backwards, since what matters is what one person offers versus what
  // the other wants to receive.
  let givingQuestionId: string | null = null;
  let receivingQuestionId: string | null = null;
  for (const [questionId, config] of questionConfigs) {
    if (config.match_key === "love_giving") givingQuestionId = questionId;
    if (config.match_key === "love_receiving") receivingQuestionId = questionId;
  }

  let loveLanguageScore = 0;
  if (givingQuestionId && receivingQuestionId) {
    const p1Giving = p1Answers.get(givingQuestionId);
    const p1Receiving = p1Answers.get(receivingQuestionId);
    const p2Giving = p2Answers.get(givingQuestionId);
    const p2Receiving = p2Answers.get(receivingQuestionId);

    if (p1Giving && p2Receiving && p1Giving === p2Receiving) loveLanguageScore += 0.5;
    if (p2Giving && p1Receiving && p2Giving === p1Receiving) loveLanguageScore += 0.5;
  }

  // STEP 5: Common hobbies (display + scoring signal)
  const commonHobbies = p1.hobbies.filter((h) => p2.hobbies.includes(h));
  const hobbyScore = commonHobbies.length > 0 ? Math.min(commonHobbies.length / 3, 1) : 0;

  // STEP 6: Final score
  // Alignment: 45% · Complement: 30% · Hobby overlap: 10% · Love language: 15%
  const finalScore = Math.round(
    alignmentScore * 45 +
    complementScore * 30 +
    hobbyScore * 10 +
    loveLanguageScore * 15
  );

  return {
    score: Math.min(finalScore, 100),
    alignmentScore,
    complementScore,
    loveLanguageScore,
    rejected: false,
    bestAlignmentCategory,
    bestComplementCategory,
    commonHobbies,
  };
}

export function generateBadge(result: CompatibilityResult): string {
  const alignmentText = ALIGNMENT_INSIGHTS[result.bestAlignmentCategory] || DEFAULT_ALIGNMENT_INSIGHT;
  const complementText = COMPLEMENT_INSIGHTS[result.bestComplementCategory] || DEFAULT_COMPLEMENT_INSIGHT;

  let badge = `${alignmentText} ${complementText}.`;
  if (result.commonHobbies.length > 0) {
    const hobbyList = result.commonHobbies.slice(0, 2).join(" and ");
    badge += ` You also both love ${hobbyList}.`;
  }
  return badge;
}
