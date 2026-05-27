# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Project ID: `fgdmyemluzzptwhwglqm`
- Env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`.env` is gitignored)

### Matching algorithm
The `supabase/functions/run-matching/index.ts` Edge Function runs on demand (triggered by admin). It:
1. Filters candidate pairs by orientation/gender compatibility
2. Scores each pair using question answers in three modes:
   - **ALIGNMENT** categories (`relationship`, `emotional_depth`, `conflict`, `values`): similar answers score higher
   - **COMPLEMENT** categories (`personality`, `communication`, `connection`): moderate differences get a bonus
   - **NEUTRAL** categories (`lifestyle`, `dating`): no scoring effect, used for flavor in match explanations
3. Uses a greedy bipartite matching algorithm to maximize total compatibility
4. Writes `matched_to`, `compatibility_score`, and `compatibility_badge` back to each participant row
5. Updates the event `status` to `revealed`, which the waiting room Realtime subscription detects

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
