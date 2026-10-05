import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// ============================================================
// AUTH — session + logged-in profile.
// Wires real Supabase auth. Once logged in, RLS opens and the data
// layer's reads return real rows (that's what unlocks live data).
// The profile (role, department) feeds scoping — one source of identity.
// ============================================================
const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('checking') // checking | signedOut | noProfile | ready
  const [error, setError] = useState(null)

  // Load the profile row for the logged-in user (role/department/status).
  const loadProfile = useCallback(async (userId) => {
    const { data, error: e } = await supabase
      .from('profiles').select('*').eq('id', userId).maybeSingle()
    if (e) { setError(e.message); setStatus('noProfile'); return }
    if (!data) { setProfile(null); setStatus('noProfile'); return }
    setProfile(data)
    setStatus('ready')
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const s = data?.session ?? null
      setSession(s)
      if (s?.user) loadProfile(s.user.id)
      else setStatus('signedOut')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      if (s?.user) { setStatus('checking'); loadProfile(s.user.id) }
      else { setProfile(null); setStatus('signedOut') }
    })
    return () => { cancelled = true; sub?.subscription?.unsubscribe?.() }
  }, [loadProfile])

  const signInWithEmail = useCallback(async (email, password) => {
    setError(null)
    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) { setError(e.message); return false }
    return true
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthCtx.Provider value={{ session, profile, status, error, signInWithEmail, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
