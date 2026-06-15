-- Security hardening:
--   • bcrypt-hash admin_password at rest
--   • column-level REVOKE so admin_password and session_token never leave the DB via REST
--   • SECURITY DEFINER functions for server-side admin auth and event updates
--   • secure match-lookup function that prevents participant enumeration
--   • drop permissive USING (true) policies on events UPDATE, questions, and hobbies
--
-- Supabase note: pgcrypto lives in the extensions schema, not public.
-- Every crypt() / gen_salt() call is schema-qualified as extensions.crypt() /
-- extensions.gen_salt() so they resolve regardless of search_path.

-- ─── pgcrypto ────────────────────────────────────────────────────────────────
-- On Supabase, pgcrypto is pre-installed in the extensions schema.
-- WITH SCHEMA extensions is idempotent when it is already there.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── Hash existing plaintext passwords BEFORE the trigger is created ─────────
-- bcrypt hashes always start with $2a$ or $2b$; skip any already hashed.
UPDATE public.events
SET    admin_password = extensions.crypt(admin_password, extensions.gen_salt('bf'))
WHERE  admin_password NOT LIKE '$2a$%'
  AND  admin_password NOT LIKE '$2b$%';

-- ─── Trigger: bcrypt-hash admin_password on every insert/change ──────────────
-- search_path includes extensions so crypt() / gen_salt() are visible
-- without schema qualification inside the function body.
CREATE OR REPLACE FUNCTION public.hash_admin_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only hash if the incoming value is plaintext (not already a bcrypt hash)
  IF NEW.admin_password NOT LIKE '$2a$%' AND NEW.admin_password NOT LIKE '$2b$%' THEN
    NEW.admin_password := crypt(NEW.admin_password, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hash_admin_password_trigger
BEFORE INSERT OR UPDATE OF admin_password ON public.events
FOR EACH ROW EXECUTE FUNCTION public.hash_admin_password();

-- ─── Column-level REVOKE ──────────────────────────────────────────────────────
-- PostgREST/REST API honours column grants: these fields will never appear in
-- any REST response, even with select=* or explicit column listing.
REVOKE SELECT (admin_password) ON public.events       FROM anon, authenticated;
REVOKE SELECT (session_token)  ON public.participants FROM anon, authenticated;

-- ─── verify_event_admin ───────────────────────────────────────────────────────
-- Server-side admin login: returns the event row (no password) only when the
-- supplied password matches the bcrypt hash.  Empty result = wrong password.
CREATE OR REPLACE FUNCTION public.verify_event_admin(
  p_event_code TEXT,
  p_password   TEXT
)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  code        TEXT,
  age_range   INTEGER,
  reveal_time TIMESTAMPTZ,
  status      TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.name, e.code, e.age_range, e.reveal_time,
         e.status, e.created_at, e.updated_at
  FROM   public.events e
  WHERE  e.code = UPPER(TRIM(p_event_code))
    AND  crypt(p_password, e.admin_password) = e.admin_password;
END;
$$;

-- ─── get_event_safe ──────────────────────────────────────────────────────────
-- Fetches an event by ID without exposing admin_password.
-- Used for admin session restoration after page reload.
CREATE OR REPLACE FUNCTION public.get_event_safe(p_event_id UUID)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  code        TEXT,
  age_range   INTEGER,
  reveal_time TIMESTAMPTZ,
  status      TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.name, e.code, e.age_range, e.reveal_time,
         e.status, e.created_at, e.updated_at
  FROM   public.events e
  WHERE  e.id = p_event_id;
END;
$$;

-- ─── admin_update_event ──────────────────────────────────────────────────────
-- Verifies the admin password before applying any update.
-- Only non-NULL arguments are applied (COALESCE keeps unchanged values).
-- Returns the updated event row.
CREATE OR REPLACE FUNCTION public.admin_update_event(
  p_event_id       UUID,
  p_admin_password TEXT,
  p_age_range      INTEGER     DEFAULT NULL,
  p_status         TEXT        DEFAULT NULL,
  p_reveal_time    TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  code        TEXT,
  age_range   INTEGER,
  reveal_time TIMESTAMPTZ,
  status      TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  v_ok BOOLEAN := FALSE;
BEGIN
  SELECT TRUE INTO v_ok
  FROM   public.events e
  WHERE  e.id = p_event_id
    AND  crypt(p_admin_password, e.admin_password) = e.admin_password;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Unauthorized: invalid admin password';
  END IF;

  UPDATE public.events e
  SET    age_range   = COALESCE(p_age_range, e.age_range),
         status      = COALESCE(p_status,    e.status),
         reveal_time = CASE WHEN p_reveal_time IS NOT NULL
                            THEN p_reveal_time
                            ELSE e.reveal_time END
  WHERE  e.id = p_event_id;

  RETURN QUERY
  SELECT e.id, e.name, e.code, e.age_range, e.reveal_time,
         e.status, e.created_at, e.updated_at
  FROM   public.events e
  WHERE  e.id = p_event_id;
END;
$$;

-- ─── check_admin_password ────────────────────────────────────────────────────
-- Boolean helper used by the Edge Function (which has the event ID, not code).
CREATE OR REPLACE FUNCTION public.check_admin_password(
  p_event_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE  e.id = p_event_id
      AND  crypt(p_password, e.admin_password) = e.admin_password
  );
$$;

-- ─── get_match_by_name ───────────────────────────────────────────────────────
-- Secure replacement for CheckMatches.tsx multi-step fetch.
-- Accepts an event code + participant name; returns only that person's match.
-- Prevents enumeration: no other participants' data is ever returned.
CREATE OR REPLACE FUNCTION public.get_match_by_name(
  p_event_code       TEXT,
  p_participant_name TEXT
)
RETURNS TABLE (
  event_status        TEXT,
  match_name          TEXT,
  match_age           INTEGER,
  compatibility_score INTEGER,
  compatibility_badge TEXT,
  instagram           TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id     UUID;
  v_event_status TEXT;
  v_part_id      UUID;
  v_matched_to   UUID;
  v_score        INTEGER;
  v_badge        TEXT;
BEGIN
  SELECT e.id, e.status
  INTO   v_event_id, v_event_status
  FROM   public.events e
  WHERE  e.code = UPPER(TRIM(p_event_code));

  IF v_event_id IS NULL THEN
    RETURN;  -- event not found → empty result
  END IF;

  IF v_event_status <> 'revealed' THEN
    -- Tell the client the event exists but isn't revealed yet
    RETURN QUERY
    SELECT v_event_status, NULL::TEXT, NULL::INTEGER, NULL::INTEGER, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT p.id, p.matched_to, p.compatibility_score, p.compatibility_badge
  INTO   v_part_id, v_matched_to, v_score, v_badge
  FROM   public.participants p
  WHERE  p.event_id = v_event_id
    AND  LOWER(TRIM(p.name)) = LOWER(TRIM(p_participant_name))
  LIMIT  1;

  IF v_part_id IS NULL OR v_matched_to IS NULL THEN
    RETURN;  -- participant not found or unmatched → empty result
  END IF;

  RETURN QUERY
  SELECT v_event_status,
         m.name::TEXT,
         m.age::INTEGER,
         v_score,
         v_badge,
         m.instagram::TEXT
  FROM   public.participants m
  WHERE  m.id = v_matched_to;
END;
$$;

-- ─── Grant execute to anon ────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.verify_event_admin   TO anon;
GRANT EXECUTE ON FUNCTION public.get_event_safe       TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_event   TO anon;
GRANT EXECUTE ON FUNCTION public.check_admin_password TO anon;
GRANT EXECUTE ON FUNCTION public.get_match_by_name    TO anon;

-- ─── Drop permissive UPDATE policy on events ─────────────────────────────────
-- All admin writes now go through admin_update_event() (SECURITY DEFINER).
-- Edge Functions use the service role which bypasses RLS and can still write.
DROP POLICY IF EXISTS "Events can be updated by anyone" ON public.events;

-- ─── Drop permissive write policies on questions and hobbies ─────────────────
-- Only the service role (Edge Functions) should modify these tables.
DROP POLICY IF EXISTS "Questions can be managed by admins" ON public.questions;
DROP POLICY IF EXISTS "Hobbies can be managed by admins"   ON public.hobbies;
