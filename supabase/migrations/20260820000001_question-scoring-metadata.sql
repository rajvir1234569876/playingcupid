-- Question scoring metadata
--
--   • is_ordinal  — opt-in flag. Distance scoring (index arithmetic on the
--                   options array) only runs when this is TRUE. Defaults FALSE
--                   so categorical questions can never be silently scored by
--                   an arbitrary option order.
--   • match_key   — lets the matching function pair two DIFFERENT questions
--                   against each other. Used for giving/receiving love
--                   language, where p1's giving must be compared to p2's
--                   receiving, not to p2's giving.
--
-- Of the 18 live questions, exactly ONE (social battery) is genuinely ordinal.

-- ─── Columns ─────────────────────────────────────────────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS is_ordinal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS match_key TEXT DEFAULT NULL;

COMMENT ON COLUMN public.questions.is_ordinal IS
  'TRUE only when option order is a meaningful scale. Gates distance scoring.';
COMMENT ON COLUMN public.questions.match_key IS
  'Pairs this question with another for cross-question scoring (e.g. love_giving/love_receiving).';

-- ─── Reset everything to safe defaults first ─────────────────────────────────
-- Any question not explicitly set below stays categorical and neutral.
UPDATE public.questions SET is_ordinal = false, match_key = NULL;

-- ─── ALIGNMENT: similar answers preferred ────────────────────────────────────
UPDATE public.questions SET category = 'values'
  WHERE question LIKE 'What do you look for most in a partner%';
UPDATE public.questions SET category = 'values'
  WHERE question LIKE 'Which green flag%';
UPDATE public.questions SET category = 'conflict'
  WHERE question LIKE 'How do you handle disagreements%';
UPDATE public.questions SET category = 'connection'
  WHERE question LIKE 'What''s your conversation sweet spot%';

-- ─── COMPLEMENT: moderate difference preferred ───────────────────────────────
UPDATE public.questions SET category = 'personality'
  WHERE question LIKE 'What''s your energy%';
UPDATE public.questions SET category = 'personality'
  WHERE question LIKE 'Your friend group would describe you%';
UPDATE public.questions SET category = 'communication'
  WHERE question LIKE 'Your texting style%';
UPDATE public.questions SET category = 'connection'
  WHERE question LIKE 'How do you show you like someone%';

-- The ONLY ordinal question in the set. Option order runs
-- 100% Extrovert → Mostly outgoing → Depends on the crowd →
-- Mostly introverted → Recharge alone, which is a clean monotonic scale.
UPDATE public.questions SET category = 'personality', is_ordinal = true
  WHERE question LIKE 'Your social battery%';

-- ─── CROSS-PAIRED: giving scored against the partner's receiving ─────────────
UPDATE public.questions SET category = 'connection', match_key = 'love_giving'
  WHERE question LIKE 'Giving love language%';
UPDATE public.questions SET category = 'connection', match_key = 'love_receiving'
  WHERE question LIKE 'Receiving love language%';

-- Normalise the option label so the two lists are identical.
-- Cross-pair scoring compares option STRINGS; 'Gift giving' vs 'Gifts'
-- would silently never match.
UPDATE public.questions
SET    options = array_replace(options, 'Gift giving', 'Gifts')
WHERE  match_key IN ('love_giving', 'love_receiving');

-- ─── NEUTRAL: no scoring effect, used for reveal narrative only ───────────────
UPDATE public.questions SET category = 'lifestyle'
  WHERE question LIKE 'Your biggest current hyperfixation%'
     OR question LIKE 'What''s your ideal weekend%'
     OR question LIKE 'After a rough day%'
     OR question LIKE 'If you were stranded on an island%'
     OR question LIKE 'Which campus event%'
     OR question LIKE 'Pick a vibe%';
UPDATE public.questions SET category = 'dating'
  WHERE question LIKE 'Pick your first date%';

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect 18 rows: 4 alignment, 5 complement, 2 cross-paired, 7 neutral,
-- and exactly one row with is_ordinal = true.
SELECT sort_order, category, is_ordinal, match_key, question
FROM   public.questions
WHERE  is_active = true
ORDER  BY sort_order;
