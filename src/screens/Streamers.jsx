import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, pct, displayDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import MiniBars from '../components/MiniBars'

// ============================================================
// STREAMERS (Stage 5) — per-streamer performance, differences shown
// VISUALLY (gross vs net gap bars). Money toggle drives the hero number
// and leaderboard. Keeps V1's operational stats (shows, hours, rev/hr).
// All figures from the money engine; nothing computed here beyond rollups.
// ============================================================

// crude hours from stream_start/end text ("14:00"-"17:30") if present.
function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart)
  return d > 0 ? d : 0
}

export default function Streamers({ scoped }) {
  const [view, setView] = useState('gross')
  const [openId, setOpenId] = useState(null)
  const field = VIEW_FIELD[view]

  // Build per-streamer rollups from the engine.
  const rows = useMemo(() => {
    const byStreamer = {}
    for (const s of scoped.streams) {
      const id = s.streamerId
      if (!id) continue
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream(
        { gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })),
        (sid) => (scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard')
      )
      const r = byStreamer[id] || (byStreamer[id] = {
        id, name: s.streamerName || '—', ladders: [], shows: 0, hours: 0,
      })
      r.ladders.push(m)
      r.shows += 1
      r.hours += hoursOf(s)
    }
    return Object.values(byStreamer).map((r) => {
      const t = sumMoney(r.ladders)
      return { ...r, t, revPerHour: r.hours > 0 ? t.gross / r.hours : 0 }
    }).sort((a, b) => b.t[field.value] - a.t[field.value])
  }, [scoped, field.value])

  const grandMax = Math.max(1, ...rows.map((r) => r.t.gross))
  const totals = useMemo(() => sumMoney(rows.map((r) => r.t)), [rows])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Streamers</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={`${rows.length} streamers`} />
        <StatCard label="Fees paid" value={gbp0(totals.fees)} accent="#c0392b" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>

      {/* Leaderboard note */}
      <div style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 6 }}>
        Ranked by {LABEL[view].toLowerCase()} · bars show gross (blue) vs net (green) — the gap is fees eaten
      </div>

      {/* Per-streamer rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, rank) => {
          const open = openId === r.id
          return (
            <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <button onClick={() => setOpenId(open ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                <div style={{ width: 22, fontWeight: 700, color: '#bbb' }}>{rank + 1}</div>
                <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{r.shows} show{r.shows === 1 ? '' : 's'}{r.hours > 0 ? ` · ${r.hours.toFixed(1)}h · ${gbp0(r.revPerHour)}/h` : ''}</div>
                </div>
                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <MiniBars
                    max={grandMax}
                    formatValue={(v) => gbp0(v)}
                    bars={[
                      { label: 'Gross', value: r.t.gross, colour: '#4a7fe0' },
                      { label: 'Net', value: r.t.net, colour: '#1a7f37' },
                    ]}
                  />
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{gbp0(r.t[field.value])}</div>
                  {field.margin && <div style={{ fontSize: 12, color: '#888' }}>{pct(r.t[field.margin])}</div>}
                </div>
              </button>

              {open && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 14px', fontSize: 13 }}>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {[
                      ['Gross', gbp0(r.t.gross)], ['Fees', gbp0(r.t.fees)], ['Net', gbp0(r.t.net)],
                      ['VAT owed', gbp0(r.t.vatOwed)], ['Net ex-VAT', gbp0(r.t.netExVat)],
                      ['True profit', gbp0(r.t.trueProfit)], ['Net margin', pct(r.t.netMarginPct)],
                    ].map(([k, v]) => (
                      <div key={k}><div style={{ color: '#999', fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ color: '#888' }}>No streamer data in scope.</p>}
      </div>
    </div>
  )
}

const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
