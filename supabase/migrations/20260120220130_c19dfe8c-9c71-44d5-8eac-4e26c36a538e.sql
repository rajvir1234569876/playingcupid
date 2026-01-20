-- OneMatch Database Schema

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  age_range INTEGER NOT NULL DEFAULT 2,
  reveal_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matching', 'revealed')),
  admin_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Participants table (session-based, no signup required)
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  city TEXT,
  gender TEXT NOT NULL,
  orientation TEXT NOT NULL,
  show_me TEXT[] NOT NULL DEFAULT '{}',
  hobbies TEXT[] NOT NULL DEFAULT '{}',
  answers JSONB NOT NULL DEFAULT '[]',
  matched_to UUID REFERENCES public.participants(id),
  compatibility_score INTEGER,
  compatibility_badge TEXT,
  rematch_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Questions table for MCQ vibe questions
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hobbies reference table
CREATE TABLE public.hobbies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hobbies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events (public read for active events)
CREATE POLICY "Events are viewable by anyone" 
ON public.events 
FOR SELECT 
USING (true);

CREATE POLICY "Events can be created by anyone" 
ON public.events 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Events can be updated by anyone" 
ON public.events 
FOR UPDATE 
USING (true);

-- RLS Policies for participants
CREATE POLICY "Participants are viewable by event participants" 
ON public.participants 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create participants" 
ON public.participants 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Participants can update their own record" 
ON public.participants 
FOR UPDATE 
USING (true);

-- RLS Policies for questions (public read)
CREATE POLICY "Questions are viewable by anyone" 
ON public.questions 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Questions can be managed by admins" 
ON public.questions 
FOR ALL 
USING (true);

-- RLS Policies for hobbies (public read)
CREATE POLICY "Hobbies are viewable by anyone" 
ON public.hobbies 
FOR SELECT 
USING (true);

CREATE POLICY "Hobbies can be managed by admins" 
ON public.hobbies 
FOR ALL 
USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
BEFORE UPDATE ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for participants and events
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- Insert default questions
INSERT INTO public.questions (question, options, category, sort_order) VALUES
('Weekend vibe?', ARRAY['Party all night', 'Netflix & chill', 'Adventure outdoors', 'Study/work hard'], 'lifestyle', 1),
('Your love language?', ARRAY['Words of affirmation', 'Quality time', 'Physical touch', 'Acts of service'], 'relationship', 2),
('Morning person or night owl?', ARRAY['Early bird 🌅', 'Night owl 🦉', 'Depends on the day', 'What is sleep?'], 'lifestyle', 3),
('Ideal first date?', ARRAY['Coffee & deep talks', 'Dinner & movie', 'Outdoor adventure', 'Concert or event'], 'relationship', 4),
('How do you handle conflict?', ARRAY['Talk it out immediately', 'Need space first', 'Avoid at all costs', 'Write it down'], 'personality', 5),
('Social battery?', ARRAY['Extreme extrovert', 'Ambivert', 'Introvert who tries', 'Hermit mode'], 'personality', 6),
('Pet preference?', ARRAY['Dog person 🐕', 'Cat person 🐱', 'Both!', 'No pets please'], 'lifestyle', 7),
('Texting style?', ARRAY['Reply in seconds', 'Reply when I can', 'Voice notes > texts', 'Call me instead'], 'communication', 8),
('Music taste?', ARRAY['Pop & mainstream', 'Hip-hop & R&B', 'Indie & alternative', 'Everything honestly'], 'lifestyle', 9),
('Food adventure level?', ARRAY['Try anything once', 'Stick to favorites', 'Spicy is life', 'Healthy eating only'], 'lifestyle', 10),
('Attachment style?', ARRAY['Secure & steady', 'Need reassurance', 'Independent AF', 'Still figuring out'], 'relationship', 11),
('Dream vacation?', ARRAY['Beach & relaxation', 'City exploration', 'Mountain adventure', 'Cultural immersion'], 'lifestyle', 12),
('How do you show you care?', ARRAY['Giving gifts', 'Spending time', 'Helping out', 'Saying it clearly'], 'relationship', 13),
('Your vibe in a group?', ARRAY['The leader', 'The funny one', 'The listener', 'The wildcard'], 'personality', 14),
('Deal breaker?', ARRAY['Bad hygiene', 'Different values', 'No ambition', 'Poor communication'], 'relationship', 15);

-- Insert default hobbies
INSERT INTO public.hobbies (name, emoji, sort_order) VALUES
('Gaming', '🎮', 1),
('Music', '🎵', 2),
('Sports', '⚽', 3),
('Reading', '📚', 4),
('Travel', '✈️', 5),
('Cooking', '👨‍🍳', 6),
('Art', '🎨', 7),
('Photography', '📷', 8),
('Dancing', '💃', 9),
('Fitness', '💪', 10),
('Movies', '🎬', 11),
('Coffee', '☕', 12),
('Hiking', '🥾', 13),
('Yoga', '🧘', 14),
('Tech', '💻', 15),
('Fashion', '👗', 16),
('Foodie', '🍕', 17),
('Anime', '🎌', 18),
('Pets', '🐾', 19),
('Writing', '✍️', 20);