# playingcupid

A real-time matchmaking app for live events. Participants join with a code, fill out a profile, and get matched — all revealed simultaneously.

## Stack

- **React 18** + **TypeScript**
- **Vite** — dev server and build tool
- **Tailwind CSS** + **shadcn/ui** (Radix UI)
- **Framer Motion** — animations
- **Supabase** — database, auth, realtime, edge functions

## Running locally

```bash
npm install
npm run dev       # http://localhost:8080
```

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

## Other commands

```bash
npm run build     # production build
npm run lint      # eslint
npm run test      # run tests
```
