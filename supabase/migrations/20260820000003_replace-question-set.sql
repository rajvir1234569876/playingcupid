-- Replace the full question set with the 18 questions below.
-- Every question trimmed to a maximum of 6 options.
--
-- Adds two scoring-metadata columns the matching function needs:
--   • is_ordinal — gates distance scoring. TRUE only where option order is a
--                  real scale. Exactly ONE question qualifies (social battery).
--   • match_key  — pairs two DIFFERENT questions for cross-question scoring,
--                  so p1's giving love language is compared against p2's
--                  receiving, not against p2's giving.
--
-- NOTE: options is text[], not jsonb. All literals use ARRAY[...].
-- WARNING: hard-deletes the old rows. Past participants' answers are keyed by
-- question id and will be orphaned. Intentional.

BEGIN;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS is_ordinal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS match_key TEXT DEFAULT NULL;

COMMENT ON COLUMN public.questions.is_ordinal IS
  'TRUE only when option order is a meaningful scale. Gates distance scoring.';
COMMENT ON COLUMN public.questions.match_key IS
  'Pairs this question with another for cross-question scoring (love_giving/love_receiving).';

DELETE FROM public.questions;

INSERT INTO public.questions (question, options, category, sort_order, is_active, is_ordinal, match_key) VALUES

('What''s your energy?',
 ARRAY['Golden Retriever','Black Cat','Main Character','Comic relief','Disney Princess','Evil Villain'],
 'personality', 1, true, false, NULL),

('Your biggest current hyperfixation?',
 ARRAY['Films & TV','Music discovery','Books','Gaming','Cooking/Baking','Art'],
 'lifestyle', 2, true, false, NULL),

('What''s your ideal weekend?',
 ARRAY['Café hopping','Movie marathon','Road trip with friends','Staying in with books/games','Exploring the city','Going to a concert'],
 'lifestyle', 3, true, false, NULL),

('How do you show you like someone?',
 ARRAY['Constant texting/memes','Quality time','Acts of service','Playful teasing','Physical affection','Deep conversations'],
 'connection', 4, true, false, NULL),

('What do you look for most in a partner?',
 ARRAY['Kindness','Humor','Emotional maturity','Intelligence','Ambition','Adventurous spirit'],
 'values', 5, true, false, NULL),

-- Cross-paired with Q7. Option lists MUST stay identical and in the same order.
('Giving love language',
 ARRAY['Words of affirmation','Acts of service','Gifts','Quality time','Physical touch'],
 'connection', 6, true, false, 'love_giving'),

('Receiving love language',
 ARRAY['Words of affirmation','Acts of service','Gifts','Quality time','Physical touch'],
 'connection', 7, true, false, 'love_receiving'),

('After a rough day, you''re most likely to...',
 ARRAY['Take a nap','Call a friend','Listen to music','Watch comfort shows','Hit the gym','Journal or read'],
 'lifestyle', 8, true, false, NULL),

('How do you handle disagreements?',
 ARRAY['Talk it out immediately','Need time before talking','Try to compromise','Crack jokes to lighten the mood','Hear everyone out first','Avoid conflict if possible'],
 'conflict', 9, true, false, NULL),

('If you were stranded on an island, what soundtrack are you bringing?',
 ARRAY['Pop anthems','Indie','Bollywood','Rock','Hip-hop/Rap','Lo-fi'],
 'lifestyle', 10, true, false, NULL),

-- The ONLY ordinal question. Options run extrovert -> introvert in order,
-- so index distance is meaningful here and nowhere else.
('Your social battery?',
 ARRAY['100% Extrovert','Mostly outgoing','Depends on the crowd','Mostly introverted','Recharge alone'],
 'personality', 11, true, true, NULL),

('Your texting style?',
 ARRAY['Replies instantly','Replies within a few hours','Sends essays','Sends one-line messages','Reacts with memes/GIFs','Accidentally disappears for days'],
 'communication', 12, true, false, NULL),

('Pick your first date.',
 ARRAY['Coffee','Bookstore','Arcade','Picnic','Night walk','Food crawl'],
 'dating', 13, true, false, NULL),

('Your friend group would describe you as...',
 ARRAY['The planner','The therapist','The funny one','The chaotic one','The quiet observer','The spontaneous one'],
 'personality', 14, true, false, NULL),

('What''s your conversation sweet spot?',
 ARRAY['Deep life talks','Pop culture','Philosophy','Science & tech','Random fun facts','Memes'],
 'connection', 15, true, false, NULL),

('Which campus event are you most likely to attend?',
 ARRAY['Live music night','Film screening','Sports match','Cultural fest','Open mic','Board game night'],
 'lifestyle', 16, true, false, NULL),

('Which green flag wins you over instantly?',
 ARRAY['They''re kind to everyone','They remember little details','They communicate honestly','They make you laugh','They''re passionate about something','They''re emotionally available'],
 'values', 17, true, false, NULL),

('Pick a vibe.',
 ARRAY['Sunrise coffee','Midnight drives','Rainy afternoons','Library corners','Cozy candlelit evenings','Beach sunsets'],
 'lifestyle', 18, true, false, NULL);

COMMIT;

-- Verify: 18 rows, sort_order 1-18.
-- Exactly ONE is_ordinal = true (row 11).
-- Exactly TWO match_key values (rows 6 and 7).
SELECT sort_order, category, is_ordinal, match_key, question
FROM   public.questions
ORDER  BY sort_order;
