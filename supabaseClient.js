import { createClient } from '@supabase/supabase-js'

// V2 connects to the SAME Supabase as V1 — same data, zero migration.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Explicit auth config: persist the session and auto-refresh the token, so
// the logged-in session is attached to every DB request (auth.uid() resolves).
// Without this, RLS sees requests as anonymous and all policies that check
// auth.uid() return nothing.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
