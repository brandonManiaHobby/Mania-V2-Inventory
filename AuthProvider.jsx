import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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
  // Tracks the user id we've already loaded a profile for. Lets us ignore the
  // routine token-refresh / focus events Supabase fires for the SAME user.
  const lastUidRef = useRef(null)

  // Load the profile row for the logged-in user (role/department/status).
  const loadProfile = useCallback(async (userId) => {
    const { data, error: e } = await supabase
      .from('profiles').select('*').eq('id', userId).maybeSingle()
    if (e) { setError(e.message); setStatus('noProfile'); return }
    if (!data) { setProfile(null); setStatus('noProfile'); return }
    setProfile(data)
    setStatus('ready')
  }, [])

  // One path for every session change. Only re-enter 'checking' + reload the
  // profile when the logged-in IDENTITY actually changes. A token refresh or a
  // focus re-validation for the same user just updates the session quietly —
  // no status churn, so screens stay mounted and in-progress forms survive
  // tabbing away to a streaming platform and back.
  const applySession = useCallback((s) => {
    setSession(s)
    const uid = s?.user?.id ?? null
    if (!uid) { setProfile(null); setStatus('signedOut'); lastUidRef.current = null; return }
    if (uid === lastUidRef.current) return  // same user — ignore refresh/focus events
    lastUidRef.current = uid
    setStatus('checking')
    loadProfile(uid)
  }, [loadProfile])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) applySession(data?.session ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => applySession(s))
    return () => { cancelled = true; sub?.subscription?.unsubscribe?.() }
  }, [applySession])

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
