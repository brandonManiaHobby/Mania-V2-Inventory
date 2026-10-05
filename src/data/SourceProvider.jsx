import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadSource } from './source'

// ============================================================
// DATA LAYER — SHARED SOURCE PROVIDER (the "one brain", wired to React)
// Loads the source ONCE up front; holds it in one place; every screen
// reads it via useSource(). refresh() reloads the one source → every
// screen re-derives identically (auto-refresh after a historic edit).
// No screen fetches its own data. Screens cannot disagree, by design.
// ============================================================
const SourceCtx = createContext(null)

export function SourceProvider({ children }) {
  const [source, setSource] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'))
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

  useEffect(() => { refresh() }, [refresh])

  return (
    <SourceCtx.Provider value={{ source, status, error, refresh }}>
      {children}
    </SourceCtx.Provider>
  )
}

// Every screen uses this to read the shared source. After any write,
// call refresh() and the whole app re-derives from the new truth.
export function useSource() {
  const ctx = useContext(SourceCtx)
  if (!ctx) throw new Error('useSource must be used inside <SourceProvider>')
  return ctx
}
