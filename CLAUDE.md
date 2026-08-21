# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** this file was out of date as of 2026-08-21 — it described a pre-security-hardening,
> pre-rewrite, and pre-migration state. If anything here contradicts the actual code, trust the
> code and flag the mismatch.

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
Admin access is event-scoped password auth — no Supabase Auth involved. The admin password is stored in plain text on the `events` row and verified client-side. The `/admin` route also supports a superadmin OTP flow to view all events.

### Session management
Participants are identified by a `session_token` (UUID) stored in `localStorage` via `src/lib/session.ts` under the key `onematch_session`. There is no user account system. The token is written on form submission and checked on every protected route — if a session exists for the current `eventId`, `ProfileForm` redirects straight to `/waiting` without showing the form.

To reset a session during development: `localStorage.removeItem('onematch_session')` in the browser console.

### Supabase integration
- Client: `src/integrations/supabase/client.ts` — typed with the generated `Database` type
- Generated types: `src/integrations/supabase/types.ts` — do not edit manually; regenerate from Supabase dashboard
- Project ID: `ugadanqxefbfecueespu`
- As of 2026-08-21, this project was migrated off Lovable-managed infrastructure onto a
  self-owned Supabase account
- Env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`.env` is gitignored)

### Matching algorithm
The `supabase/functions/run-matching/` Edge Function runs on demand (triggered by admin) and is
split across three files:

- **`index.ts`** — the Deno.serve handler: verifies the admin password, loads the event/questions/
  participants, calls into `matching.ts`, and writes the results back to the DB.
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

#### Categorical (non-ordinal) scoring: `CLUSTER_DEFINITIONS`
Non-ordinal questions score via `CLUSTER_DEFINITIONS` in `scoring.ts`, keyed by the **exact
question text**, not category. This is deliberate: several questions share a category (e.g.
`personality` covers "energy", "social battery", and "friend group" all at once), so keying
clusters by category would silently apply one question's option-string clusters to a different
question's answers. Every option string in `CLUSTER_DEFINITIONS` must match the live `questions`
table exactly — `src/test/fixtures/live-questions-snapshot.json` is a pulled snapshot used by
`src/test/cluster-drift.test.ts` to guard against this drifting again (a renamed or trimmed option
just silently fails to cluster; it doesn't throw).

#### Alignment vs. complement categories
- **`ALIGNMENT_CATEGORIES`** (similar answers score higher): `relationship`, `emotional_depth`,
  `conflict`, `values`.
- **`COMPLEMENT_CATEGORIES`** (moderate difference gets a bonus): `personality`, `communication`,
  `connection`.

As of 2026-08-21, the live question set only populates `conflict` and `values` from the alignment
list — **`relationship` and `emotional_depth` currently match zero live questions**, so alignment
scoring effectively runs on just 3 of the 18 questions. This is a known, flagged gap (not a bug to
silently work around) — either a question needs to be tagged with one of those two categories, or
the category list should be trimmed to match reality. All three complement categories are
populated.

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

### Displayed vs. true compatibility score
`src/lib/score.ts` exports `displayScore()`, which maps the true 0-100 compatibility score into an
85-99 display range (`85 + (trueScore / 100) * 14`, rounded). The `compatibility_score` stored on
the `participants` row is always the true, unmodified value — nothing ever writes a scaled score
to the DB. `AdminPanel` shows both the true score and `displayScore()`'s output side by side; every
other surface (`MatchCard`, `CheckMatches`) renders only the displayed value. This exists purely so
every match feels strong at reveal time — it's cosmetic and has no effect on who gets matched with
whom; the matching algorithm itself only ever sees and acts on true scores.

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
