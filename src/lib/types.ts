export interface Event {
  id: string;
  name: string;
  code: string;
  age_range: number;
  reveal_time: string | null;
  status: 'waiting' | 'matching' | 'revealed';
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  event_id: string;
  session_token: string;
  name: string;
  age: number;
  city: string | null;
  instagram: string | null;
  gender: string;
  orientation: string;
  show_me: string[];
  hobbies: string[];
  answers: Answer[];
  matched_to: string | null;
  compatibility_score: number | null;
  compatibility_badge: string | null;
  rematch_used: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  category: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Hobby {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
}

export interface Answer {
  question_id: string;
  answer: string;
}

export interface MatchResult {
  participant: Participant;
  match: Participant | null;
  commonInterests: string[];
  compatibilityScore: number;
  badge: string;
}

export type FormStep = 'basics' | 'preferences' | 'hobbies' | 'questions';
