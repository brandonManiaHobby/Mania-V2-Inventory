# Mania V2

Clean rebuild of the Mania inventory/stream platform. Same Supabase backend as V1
(zero data migration — reads the same database). Currently at **Stage 0** (scaffold +
connection proof).

## Deploy (Stage 0 — prove the pipe works)
1. Push this folder to a NEW GitHub repo (keep separate from V1).
2. New Vercel project → import this repo (Vite auto-detected).
3. Add Environment Variables (SAME values as V1 — copy from V1's Vercel settings,
   or Supabase → Project Settings → API):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy → open the URL.
5. Expect: "Mania V2 · BUILD STAGE 0" + ✓ Connected + a real product count.
   That means the shell loads, reads live data, and is isolated from V1.

## Local run (optional)
    npm install
    npm run dev
(needs a .env.local with the two VITE_ vars above)

## Structure
    src/data/      data layer (Stage 1) — one shared source
    src/money/     money engine (Stage 2) — the 9-layer ladder
    src/scoping/   scoping (Stage 3)
    src/components/ shared component library
    src/screens/   screens as lenses (Stage 5)
