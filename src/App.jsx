import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// ============================================================
// STAGE 0 GATE — proves the pipe works:
// V2 shell loads, connects to the SAME Supabase as V1, shows real data.
// This is deliberately minimal. Real screens come in Stage 5, built on
// the data layer (Stage 1), money module (Stage 2), scoping (Stage 3).
// ============================================================
export default function App() {
  const [status, setStatus] = useState('connecting')
  const [sampleCount, setSampleCount] = useState(null)
  const [sampleProduct, setSampleProduct] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function probe() {
      try {
        // Read one real row from the shared DB to prove the connection.
        const { count, error: cErr } = await supabase
          .from('stock_items')
          .select('*', { count: 'exact', head: true })
        if (cErr) throw cErr

        const { data, error: pErr } = await supabase
          .from('stock_items')
          .select('product')
          .limit(1)
        if (pErr) throw pErr

        if (cancelled) return
        setSampleCount(count)
        setSampleProduct(data?.[0]?.product ?? '(none)')
        setStatus('connected')
      } catch (e) {
        if (cancelled) return
        setError(e.message || String(e))
        setStatus('error')
      }
    }
    probe()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '60px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mania V2</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fde68a', color: '#7c5e00', fontWeight: 700 }}>
          BUILD · STAGE 0
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>Clean core engine — same Supabase backend as V1.</p>

      <div style={{ marginTop: 24, padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
        {status === 'connecting' && <p>Connecting to Supabase…</p>}
        {status === 'connected' && (
          <>
            <p style={{ fontWeight: 700, color: '#1a7f37', margin: 0 }}>✓ Connected — pipe works.</p>
            <p style={{ margin: '8px 0 0' }}>Live read from the shared database:</p>
            <ul style={{ marginTop: 6 }}>
              <li><strong>{sampleCount}</strong> products in <code>stock_items</code></li>
              <li>Sample product: <strong>{sampleProduct}</strong></li>
            </ul>
            <p style={{ color: '#666', fontSize: 13, marginTop: 10 }}>
              Next: Stage 1 — the data layer (every read/write through named functions).
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <p style={{ fontWeight: 700, color: '#c82828', margin: 0 }}>✗ Connection failed</p>
            <p style={{ fontSize: 13, color: '#666' }}>{error}</p>
            <p style={{ fontSize: 13, color: '#666' }}>Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.</p>
          </>
        )}
      </div>
    </div>
  )
}
