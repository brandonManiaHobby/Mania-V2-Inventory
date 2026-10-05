import { createClient } from '@supabase/supabase-js'

// V2 connects to the SAME Supabase as V1 — same data, zero migration.
// Env vars injected at build time (Vercel), identical to V1's keys.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)
