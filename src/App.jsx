import { useState } from 'react'
import { useSource, int } from './data'
import { scopeSource } from './scoping'

// ============================================================
// STAGE 3 GATE — proves central scoping:
// Pick a role; the scoped view updates. A lead sees only their dept,
// a streamer only their own — enforced at the source, not the UI.
// (Uses the live source; counts reflect RLS until auth lands in Stage 4.)
// ============================================================
const SAMPLE_ROLES = [
  { label: 'Admin', profile: { id: 'demo', role: 'admin', department: null } },
  { label: 'Manager', profile: { id: 'demo', role: 'manager', department: null } },
  { label: 'Lead (Mania TCG)', profile: { id: 'demo', role: 'channel_lead', department: 'Mania TCG' } },
  { label: 'Warehouse', profile: { id: 'demo', role: 'warehouse', department: null } },
  { label: 'Streamer', profile: { id: 'demo', role: 'breaker', department: 'Mania TCG' } },
]

export default function App() {
  const { source, status } = useSource()
  const [idx, setIdx] = useState(0)
  const chosen = SAMPLE_ROLES[idx]
  const scoped = scopeSource(source, chosen.profile)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mania V2</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fde68a', color: '#7c5e00', fontWeight: 700 }}>
          BUILD · STAGE 3
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>Scoping — enforced once at the source. Pick a role to see its view.</p>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {SAMPLE_ROLES.map((r, i) => (
            <button key={r.label} onClick={() => setIdx(i)}
              style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                border: '1px solid ' + (i === idx ? '#7c5e00' : '#ddd'),
                background: i === idx ? '#fde68a' : '#faf9f7', fontWeight: i === idx ? 700 : 400 }}>
              {r.label}
            </button>
          ))}
        </div>

        {status !== 'ready' && <p>Loading source…</p>}
        {status === 'ready' && (
          <>
            <p style={{ margin: 0, fontWeight: 700 }}>Viewing as: {chosen.label}</p>
            <div style={{ color: '#666', fontSize: 13, margin: '4px 0 12px' }}>
              Caps: {Object.entries(scoped.cap).filter(([k, v]) => v === true).map(([k]) => k).join(' · ') || '—'}
            </div>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Streams in scope', scoped.streams.length],
                  ['Stream lines', scoped.streamLines.length],
                  ['Holdings', scoped.holdings.length],
                  ['Profiles', scoped.profiles.length],
                  ['Stock items', scoped.stockItems.length],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 0', color: '#444' }}>{k}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{int(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: '#666', fontSize: 13, marginTop: 12 }}>
              A lead/streamer physically cannot receive out-of-scope rows — filtered here, not in the UI.
              Next: Stage 4 — nav shell + auth (live data unlocks).
            </p>
          </>
        )}
      </div>
    </div>
  )
}
