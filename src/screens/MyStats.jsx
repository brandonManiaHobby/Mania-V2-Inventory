import { useState, useMemo } from 'react'
import { gbp0, gbp, int, toDateKey, parseLocalDate, displayDate, shortName } from '../data'
import StatCard from '../components/StatCard'
import OverlayChart from '../components/OverlayChart'

// ============================================================
// MY STATS (streamer) — a streamer's own performance, V1 parity:
// revenue generated, streams, hours streamed, products used, and a cumulative
// revenue graph. Ranges are ROLLING 7-day windows (not calendar blocks) so
// the counts are accurate: this week = the last 7 days, etc. Scoped data is
// already the streamer's own, so this only ever shows their figures.
// ============================================================
const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  let d = p(s.streamEnd) - p(s.streamStart); if (d < 0) d += 24; return d > 0 ? d : 0
}
const addDays = (ymd, n) => { const d = parseLocalDate(ymd); d.setDate(d.getDate() + n); return toDateKey(d) }

export default function MyStats({ scoped }) {
  const today = toDateKey(new Date())
  // rolling windows, all 7-day based
  const RANGES = [
    { k: 'this', label: 'This week', from: addDays(today, -6), to: today },
    { k: 'prev', label: 'Previous week', from: addDays(today, -13), to: addDays(today, -7) },
    { k: '2wk', label: 'Last 2 weeks', from: addDays(today, -13), to: today },
    { k: '30d', label: 'Last 30 days', from: addDays(today, -29), to: today },
  ]
  const [rangeK, setRangeK] = useState('this')
  const range = RANGES.find((r) => r.k === rangeK)

  const model = useMemo(() => {
    const streams = scoped.streams.filter((s) => s.streamDate && s.streamDate >= range.from && s.streamDate <= range.to)
    let revenue = 0, hours = 0, units = 0
    const products = new Set()
    const byDay = {}
    for (const s of streams) {
      const g = Number(s.totalSales) || 0
      revenue += g; hours += hoursOf(s)
      byDay[s.streamDate] = (byDay[s.streamDate] || 0) + g
      for (const l of scoped.streamLines) {
        if (l.streamId === s.id && !l.brokered && l.lineKind !== 'giveaway') { units += Number(l.qty) || 0; if (l.product) products.add(shortName(l.product)) }
      }
    }
    // cumulative revenue across every day in the window (so the line always spans the range)
    const days = []; let cur = range.from
    while (cur <= range.to) { days.push(cur); cur = addDays(cur, 1) }
    let run = 0
    const cumulative = days.map((d) => { run += byDay[d] || 0; return run })
    // products ran table
    const prodRows = {}
    for (const s of streams) for (const l of scoped.streamLines) {
      if (l.streamId === s.id && !l.brokered && l.lineKind !== 'giveaway') {
        const name = shortName(l.product || '—')
        const r = prodRows[name] || (prodRows[name] = { name, units: 0, revenue: 0 })
        r.units += Number(l.qty) || 0; r.revenue += Number(l.lineTotal) || 0
      }
    }
    const productList = Object.values(prodRows).sort((a, b) => b.units - a.units)
    return { streams: streams.length, revenue, hours, units, products: products.size, days, cumulative, productList }
  }, [scoped, range.from, range.to])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>My Stats</h2>
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999, flexWrap: 'wrap' }}>
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRangeK(r.k)}
              style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: rangeK === r.k ? 700 : 400, background: rangeK === r.k ? '#fff' : 'transparent' }}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
        {displayDate(range.from, { day: 'numeric', month: 'short' })} – {displayDate(range.to, { day: 'numeric', month: 'short' })} · rolling 7-day
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        <StatCard label="Revenue generated" value={gbp0(model.revenue)} />
        <StatCard label="Streams" value={int(model.streams)} />
        <StatCard label="Hours streamed" value={model.hours > 0 ? model.hours.toFixed(1) + 'h' : '—'} />
        <StatCard label="Products used" value={int(model.units)} sub={`${model.products} different`} />
      </div>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Cumulative revenue</div>
        {model.revenue === 0 ? <p style={{ color: '#888' }}>No streams in this window yet.</p> : (
          <OverlayChart labels={model.days.map((d) => displayDate(d, { day: 'numeric', month: 'short' }))} formatY={gbp0}
            series={[{ label: 'Revenue', colour: '#ff6a00', points: model.cumulative.map((y, i) => ({ x: i, y })) }]} />
        )}
      </div>

      {model.productList.length > 0 && (
        <div style={{ marginTop: 18, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Products you ran</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 360 }}>
              <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
                <th style={{ textAlign: 'left' }}>Product</th><th>Units</th><th>Revenue</th>
              </tr></thead>
              <tbody>
                {model.productList.map((p) => (
                  <tr key={p.name} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '5px 0' }}>{p.name}</td>
                    <td>{int(p.units)}</td><td>{gbp0(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
