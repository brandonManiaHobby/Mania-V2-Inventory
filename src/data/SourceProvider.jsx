import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadSource } from './source'
import { useAuth } from '../auth'

// ============================================================
// DATA LAYER — SHARED SOURCE PROVIDER (the "one brain")
// Loads the source into one place; every screen reads via useSource().
//
// CRITICAL ORDERING: the source must load only AFTER auth is ready, and
// reload when the auth identity changes. RLS keys off auth.uid() — if we
// fetch before login resolves, every table returns empty (anonymous) and
// never recovers. So we gate the load on the auth session.
// ============================================================
const SourceCtx = createContext(null)

export function SourceProvider({ children }) {
  const { status: authStatus, session } = useAuth()
  const [source, setSource] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await loadSource()
      setSource(data)
      setStatus('ready')
      setError(null)
    } catch (e) {
      setError(e.message || String(e))
      setStatus('error')
    }
  }, [])

  // Load ONLY once auth is resolved. Re-run when the logged-in user changes
  // (login completes / switches account) so RLS-scoped data is fetched with
  // the right identity attached.
  useEffect(() => {
    if (authStatus === 'ready') {
      refresh()
    } else if (authStatus === 'signedOut') {
      setSource(null)
      setStatus('idle')
    }
    // authStatus 'checking'/'noProfile' -> hold off
  }, [authStatus, session?.user?.id, refresh])

  return (
    <SourceCtx.Provider value={{ source, status, error, refresh }}>
      {children}
    </SourceCtx.Provider>
  )
}

export function useSource() {
  const ctx = useContext(SourceCtx)
  if (!ctx) throw new Error('useSource must be used inside <SourceProvider>')
  return ctx
}
