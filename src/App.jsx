import { useSource, displayDate, int } from './data'

// ============================================================
// STAGE 1 GATE — proves the data layer works:
// The shared source loads ONCE, and the app reads everything from that
// single "brain". This screen just reports what the source holds —
// proving named reads, normalisation, dates and precision all flow
// through the one boundary. Real screens (lenses) come in Stage 5.
// ============================================================
export default function App() {
  const { source, status, error, refresh } = useSource()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 620, margin: '48px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mania V2</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fde68a', color: '#7c5e00', fontWeight: 700 }}>
          BUILD · STAGE 1
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>Data layer — one shared source, same Supabase as V1.</p>

      <div style={{ marginTop: 24, padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
        {status === 'loading' && <p>Loading the shared source…</p>}

        {status === 'error' && (
          <>
            <p style={{ fontWeight: 700, color: '#c82828', margin: 0 }}>✗ Source failed to load</p>
            <p style={{ fontSize: 13, color: '#666' }}>{error}</p>
          </>
        )}

        {status === 'ready' && source && (
          <>
            <p style={{ fontWeight: 700, color: '#1a7f37', margin: 0 }}>✓ Shared source loaded — one brain, read once.</p>
            <p style={{ margin: '8px 0 4px', color: '#666', fontSize: 13 }}>
              Loaded {displayDate(source.loadedAt)} · every screen will derive from this.
            </p>
            <table style={{ width: '100%', marginTop: 8, fontSize: 14, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Stock items', source.stockItems.length],
                  ['Waves', source.waves.length],
                  ['Holdings', source.holdings.length],
                  ['Streams', source.streams.length],
                  ['Stream lines', source.streamLines.length],
                  ['Distro sales', source.distroSales.length],
                  ['Profiles', source.profiles.length],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 0', color: '#444' }}>{k}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{int(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: '#666', fontSize: 13, marginTop: 12 }}>
              Note: counts show 0 until a user is logged in (RLS protects the data — expected).
              Next: Stage 2 — the money engine.
            </p>
            <button onClick={refresh}
              style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer' }}>
              Refresh source
            </button>
          </>
        )}
      </div>
    </div>
  )
}
