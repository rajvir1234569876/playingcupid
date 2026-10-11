# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Current as of 2026-08-29.** Reflects the post-migration, post-security-hardening state. If
> anything here contradicts the actual code, trust the code and flag the mismatch.

## Commands

```bash
npm run dev          # Start dev server (Vite, port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
```

Run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

## Architecture

**Playing Cupid** is a real-time matchmaking app for live events. Participants join an event by code, fill out a profile, wait in a holding room, and then see their match revealed simultaneously when the admin triggers it.

### User flow
1. `/` — Home page with three cards: Join Event, Create Event, Check Matches
2. `/join` — Enter an event code to join; navigates to `/form/:eventId`
3. `/form/:eventId` — Multi-step profile form (basics → preferences → hobbies → MCQ questions)
4. `/waiting/:eventId` — Waiting room with live participant count and countdown; uses Supabase Realtime to detect when event status changes to `revealed`
5. `/reveal/:eventId` — Animated match reveal with confetti; shows match profile, compatibility badge, common hobbies, and icebreaker questions
6. `/check-matches` — Participant self-service: re-enter details to look up a previous match
7. `/admin` — Admin panel: create events, manage participants, trigger matching, view all events

All pages except the home page have a Back button in the top-left returning to `/`.

### Profile form — questions step
The questions step (`src/pages/ProfileForm.tsx`) has a non-linear navigation sidebar (`src/components/QuestionSidebar.tsx`):
- **Desktop**: sticky right sidebar showing a compact wrapped grid of numbered squares — green when answered, grey when not, primary ring on the current question
- **Mobile**: collapsible panel above the question card, toggled by an "X / Y answered" bar
- Clicking any square jumps directly to that question via `handleJumpToQuestion`, which cancels the 300ms auto-advance timeout (stored in `autoAdvanceRef`) before jumping
- "Find My Match" is always visible during the questions step; pressing it while questions remain unanswered sets `submitAttempted` (turning unanswered squares red), toasts "You have X questions left", and jumps to the first unanswered question

### Admin authentication
Admin access is event-scoped password auth — no Supabase Auth involved. The `/admin` route also
supports a superadmin OTP flow to view all events.

**Passwords are bcrypt-hashed, not plain text.** Hashing and verification go through `pgcrypto`,
called as `extensions.crypt()` — always schema-qualified, because `pgcrypto` lives in the
`extensions` schema and an unqualified call will fail or resolve unpredictably depending on
`search_path`. Verification happens server-side; the password is never compared client-side and
the hash column is not readable by the anon role.

Do not "simplify" this back to a plain-text comparison, and do not add a client-side password
check as a convenience. Both were the pre-hardening design and were deliberately removed.

### Session management
Participants are identified by a `session_token` (UUID) stored in `localStorage` via `src/lib/session.ts` under the key `onematch_session`. There is no user account system. The token is written on form submission and checked on every protected route — if a session exists for the current `eventId`, `ProfileForm` redirects straight to `/waiting` without showing the form.

To reset a session during development: `localStorage.removeItem('onematch_session')` in the browser console.

### Supabase integration
- Client: `src/integrations/supabase/client.ts` — typed with the generated `Database` type
- Generated types: `src/integrations/supabase/types.ts` — do not edit manually; regenerate from Supabase dashboard
- **Project ref: `ugadanqxefbfecueespu`** (Mumbai / `ap-south-1`)
- Env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`.env` is gitignored)

**`fgdmyemluzzptwhwglqm` is the old Lovable-managed project.** It is not owned by us and is not in
use. If that ref appears anywhere in CLI output, config, or a URL, something is wrong — stop and
flag it rather than proceeding.

Region is permanent (Supabase cannot relocate a project after creation). Mumbai is correct: the
reveal fires simultaneously across many phones in one room in India, so latency is a product
requirement, not a preference.

#### CLI gotchas
- When `supabase link` fails with a privileges error, **the CLI silently falls back to the
  previously-linked project and `functions deploy` still reports success.** Always read the project
  ref in the deploy output and confirm it says `ugadanqxefbfecueespu`.
- `SUPABASE_ACCESS_TOKEN` must be exported in the same shell session where the CLI runs. It does
  not propagate across terminal tabs or into subprocesses.
- In the SQL editor, wrap destructive multi-statement scripts in `BEGIN` / `COMMIT` so a failed
  insert rolls back the preceding delete instead of leaving the table empty.

#### Schema gotchas
- `public.questions.options` is `text[]`, **not** `jsonb`. Use `ARRAY['a','b','c']` syntax.
- Option order within a question is semantically meaningful to scoring (see `is_ordinal` and
  `CLUSTER_DEFINITIONS` below). Never reorder options casually.
- Never build on a question set drafted in chat or copied from a doc — query the live table first.

### Matching algorithm
The `supabase/functions/run-matching/` Edge Function runs on demand (triggered by admin) and is
split across three files:

- **`index.ts`** — the Deno.serve handler: performs the admin auth check, loads the event/questions/
  participants, calls into `matching.ts`, and writes the results back to the DB. The function is
  gated behind admin auth — it is not callable by an unauthenticated client.
- **`scoring.ts`** — pure compatibility scoring (`calculateCompatibility`, `generateBadge`,
  `checkOrientationCompatibility`). No Deno-only APIs or remote imports.
- **`matching.ts`** — the pairing/assignment loop (`matchParticipants`). Also pure, no Deno-only
  APIs.

`scoring.ts` and `matching.ts` are kept free of Deno-only APIs and remote imports specifically so
they can be unit tested directly under Vitest (`src/test/matching.test.ts`,
`src/test/matching-assignment.test.ts`, `src/test/cluster-drift.test.ts`) without spinning up the
edge function's `Deno.serve` handler.

#### Hard filters
Only two things reject a pair outright: age difference beyond the event's `age_range`, and
orientation/gender incompatibility (`checkOrientationCompatibility` — both people's `show_me`
must include the other's mapped gender, or "Everyone"). There is no other hard rejection
threshold — every other signal below is a ranking/scoring input, not a pass/fail gate. The
guiding principle (see the comment in `scoring.ts`): at a live event, an unmatched person is
worse than an imperfect match.

#### Question metadata: `is_ordinal` and `match_key`
The `questions` table has two scoring-metadata columns beyond `category`:
- **`is_ordinal`** — TRUE only when the question's option order is a genuine scale (currently just
  "Your social battery?"). Gates whether a pair's answers are scored by index *distance*
  (`getAnswerDistance`) versus by cluster (see below). Only one live question currently qualifies.
- **`match_key`** — pairs two *different* questions for cross-question scoring. Currently used for
  `love_giving`/`love_receiving` ("Giving love language" / "Receiving love language"): p1's giving
  answer is compared against p2's receiving answer and vice versa, not giving-to-giving. A
  match_key'd question is scored via this cross-question path and is excluded from the normal
  per-question complement loop.

Index-distance scoring is meaningless for categorical questions — that's the whole reason
`is_ordinal` gates it. Do not widen index-distance scoring to un-gated questions.

#### Categorical (non-ordinal) scoring: `CLUSTER_DEFINITIONS`
Non-ordinal questions score via `CLUSTER_DEFINITIONS` in `scoring.ts`, keyed by the **exact
question text**, not category. This is deliberate: several questions share a category (e.g.
`personality` covers "energy", "social battery", and "friend group" all at once), so keying
clusters by category would silently apply one question's option-string clusters to a different
question's answers. Every option string in `CLUSTER_DEFINITIONS` must match the live `questions`
table exactly — `src/test/fixtures/live-questions-snapshot.json` is a pulled snapshot used by
`src/test/cluster-drift.test.ts` to guard against this drifting again (a renamed or trimmed option
just silently fails to cluster; it doesn't throw).

If you edit question text or option strings in the DB, re-pull the snapshot fixture and re-run
`cluster-drift.test.ts` in the same change. Editing one without the other is how the drift got in
last time.

#### Alignment vs. complement categories
- **`ALIGNMENT_CATEGORIES`** (similar answers score higher): `relationship`, `emotional_depth`,
  `conflict`, `values`.
- **`COMPLEMENT_CATEGORIES`** (moderate difference gets a bonus): `personality`, `communication`,
  `connection`.

As of 2026-08-21, the live question set only populates `conflict` and `values` from the alignment
list — **`relationship` and `emotional_depth` matched zero live questions**, so alignment
scoring effectively ran on just 3 of the 18 questions. This is a known, flagged gap (not a bug to
silently work around) — either a question needs to be tagged with one of those two categories, or
the category list should be trimmed to match reality. All three complement categories are
populated. Re-verify this against the live `questions` table before acting on it; the counts above
have not been re-checked since 2026-08-21.

#### Assignment loop (`matching.ts`)
1. **Greedy pass** (`greedyPass`): score every eligible pair, sort best-first, walk the sorted list
   once, claiming a pair whenever both sides are still free.
2. **Repair pass**: whoever is left unmatched after the greedy pass is *not* rescuable by simply
   re-scoring pairs among just the leftovers — that's provably a no-op. Because the greedy pass
   scores and sorts *every* pair up front and walks the complete list, two mutually-eligible people
   can never both end up unmatched (whichever one's turn comes first in the sorted order would
   claim them both). The same argument rules out a single-edge "swap" too: if some unmatched X
   could beat some matched T's current partner, that X-T edge would have sorted earlier and
   claimed them before T's actual pairing ever formed. So instead, `matchParticipants` searches for
   **augmenting paths**: chains like `X → T (new edge) → T's current partner P (existing edge,
   broken) → Y (new edge)`, ending at a different unmatched person Y. Flipping every edge on the
   path nets two more matched people without requiring any single edge on the chain to score
   higher than what it replaces — only that the whole chain is eligible end to end. This search
   does not handle blossoms (odd alternating cycles) in the general-graph case, so it can
   occasionally miss a valid augmenting path a full Edmonds'-blossom implementation would find —
   an accepted simplification at this event scale.
3. The final matches are written back via `matched_to`, `compatibility_score`, and
   `compatibility_badge` on each participant row, and the event `status` is updated to `revealed`,
   which the waiting room Realtime subscription detects.

**Do not re-add a same-pool greedy second pass.** It has been proposed and disproved twice; stranded
users reflect real pool scarcity (candidates claimed earlier by better-scoring pairs), not a
premature loop exit.

### Displayed vs. true compatibility score
`src/lib/score.ts` exports `displayScore()`, which maps the true 0-100 compatibility score into an
85-99 display range (`85 + (trueScore / 100) * 14`, rounded). The `compatibility_score` stored on
the `participants` row is always the true, unmodified value — nothing ever writes a scaled score
to the DB. `AdminPanel` shows both the true score and `displayScore()`'s output side by side; every
other surface (`MatchCard`, `CheckMatches`) renders only the displayed value. This exists purely so
every match feels strong at reveal time — it's cosmetic and has no effect on who gets matched with
whom; the matching algorithm itself only ever sees and acts on true scores.

This is an intentional product decision, not a bug. Do not "fix" it to show true scores.

### Key types (`src/lib/types.ts`)
- `Event` — event row with `status: 'waiting' | 'matching' | 'revealed'`
- `Participant` — participant row including `matched_to` UUID (self-referential FK), `answers: Answer[]`
- `Question` — MCQ question with `category` used by the matching algorithm
- `FormStep` — union type driving the multi-step profile form (`'basics' | 'preferences' | 'hobbies' | 'questions'`)

### UI stack
- Tailwind CSS with `tailwind-merge` + `class-variance-authority`
- shadcn/ui components in `src/components/ui/` (Radix UI primitives)
- Framer Motion for page/card animations
- Path alias `@/` maps to `src/`

### Testing
Tests live in `src/**/*.{test,spec}.{ts,tsx}`. Test setup is in `src/test/setup.ts`. The jsdom environment is configured in `vitest.config.ts`.

## Security state

Completed:
- Admin passwords bcrypt-hashed via `pgcrypto`, called as `extensions.crypt()` (schema-qualified)
- Sensitive column access revoked from the anon role
- Participant enumeration closed
- `run-matching` edge function gated behind an admin auth check

Outstanding:
- **RLS on `public.participants` is incomplete** — the `select`, `update`, and `delete` policies
  still evaluate to `true`. This is the highest-priority open item. Anyone holding the anon key can
  read or modify the table.
- Until that is closed, the live app URL should not be published in promotional material.

## Known open items

- Full end-to-end matching run on the live site, post-auth-deploy, is **still unverified**
- RLS on `participants` (above)
- `GEMINI_API_KEY` has not yet been added as a secret on `ugadanqxefbfecueespu`
- Load-test dummy events `LOADXX` and `LOADXXA21D` are still present in the production database
  and should be deleted
- Reveal copy has limited variety and repeats visibly at 70+ participants

## Roadmap

1. OG image for social previews
2. Gale-Shapley upgrade to replace the greedy assignment
3. Gemini narrative layer (`gemini-2.0-flash`)
4. Post-event feedback loop
5. Prevent double reveals

**Gemini layer constraint:** it must live in a separate, non-blocking edge function. It must not be
called from inside `run-matching`. A Gemini timeout, error, or quota failure must never prevent
matching from completing or the reveal from firing — degrade to the existing non-narrative reveal
silently. Two open-ended questions are planned to feed this layer.

## Working agreement

- Matching logic is frozen well ahead of any live event. Do not refactor `scoring.ts` or
  `matching.ts` close to an event date.
- **Verify before asserting.** Check `.env`, query the live table, read the deploy output. Do not
  state where data lives or what questions exist without checking first — this has produced wrong
  answers on this project more than once.
- Prefer small, verifiable steps over large speculative rewrites.