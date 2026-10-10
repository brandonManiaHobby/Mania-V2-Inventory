import { useState, useMemo } from 'react'
import { computeStream, computeMoney, sumMoney } from '../money'
import { gbp0, gbp, pct, int, monthKey, parseLocalDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import MiniBars from '../components/MiniBars'
import OverlayChart from '../components/OverlayChart'

// ============================================================
// STREAMERS (Stage 5 — FULL V1 PARITY + money layers)
// List with gap bars + rank. Tap -> deep dive: month-by-month trend,
// vs-prior-period delta, product sub-sections (what they sell + margins),
// owned vs brokered split. Money toggle throughout.
// ============================================================
function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}
const monL = (m) => { const d = parseLocalDate(m + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : m }
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

export default function Streamers({ scoped }) {
  const [view, setView] = useState('gross')
  const [openId, setOpenId] = useState(null)
  const field = VIEW_FIELD[view]
  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const rows = useMemo(() => {
    const by = {}
    for (const s of scoped.streams) {
      if (!s.streamerId) continue
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      const r = by[s.streamerId] || (by[s.streamerId] = { id: s.streamerId, name: s.streamerName || '—', streams: [], ladders: [], shows: 0, hours: 0 })
      r.streams.push(s); r.ladders.push({ ...m, month: monthKey(s.streamDate) }); r.shows += 1; r.hours += hoursOf(s)
    }
    return Object.values(by).map((r) => ({ ...r, t: sumMoney(r.ladders), revPerHour: r.hours > 0 ? sumMoney(r.ladders).gross / r.hours : 0 }))
      .sort((a, b) => b.t[field.value] - a.t[field.value])
  }, [scoped, field.value])

  const grandMax = Math.max(1, ...rows.map((r) => r.t.gross))
  const totals = useMemo(() => sumMoney(rows.map((r) => r.t)), [rows])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Streamers</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={`${rows.length} streamers`} />
        <StatCard label="Fees paid" value={gbp0(totals.fees)} accent="#c0392b" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net margin`} />
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 6 }}>
        Ranked by {LABEL[view].toLowerCase()} · bars = gross (blue) vs net (green) · tap for the deep dive
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, rank) => (
          <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
              <div style={{ width: 22, fontWeight: 700, color: '#bbb' }}>{rank + 1}</div>
              <div style={{ flex: '1 1 130px', minWidth: 110 }}>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{r.shows} shows{r.hours > 0 ? ` · ${r.hours.toFixed(1)}h · ${gbp0(r.revPerHour)}/h` : ''}</div>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                <MiniBars max={grandMax} formatValue={gbp0} bars={[{ label: 'Gross', value: r.t.gross, colour: '#4a7fe0' }, { label: 'Net', value: r.t.net, colour: '#1a7f37' }]} />
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{gbp0(r.t[field.value])}</div>
                {field.margin && <div style={{ fontSize: 12, color: '#888' }}>{pct(r.t[field.margin])}</div>}
              </div>
            </button>
            {openId === r.id && <StreamerDeep r={r} scoped={scoped} view={view} field={field} vatOf={vatOf} />}
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: '#888' }}>No streamer data in scope.</p>}
      </div>
    </div>
  )
}

function StreamerDeep({ r, scoped, view, field, vatOf }) {
  const dive = useMemo(() => {
    const bm = {}
    for (const l of r.ladders) { if (!l.month) continue; bm[l.month] = bm[l.month] || []; bm[l.month].push(l) }
    const months = Object.keys(bm).sort()
    const monthly = months.map((m) => ({ m, t: sumMoney(bm[m]) }))
    const lastTwo = monthly.slice(-2)
    const delta = lastTwo.length === 2 ? lastTwo[1].t[field.value] - lastTwo[0].t[field.value] : null
    const deltaPct = (lastTwo.length === 2 && lastTwo[0].t[field.value]) ? delta / lastTwo[0].t[field.value] : null

    const byProduct = {}; let brokeredSales = 0, ownedSales = 0
    for (const s of r.streams) {
      for (const l of scoped.streamLines.filter((x) => x.streamId === s.id)) {
        if (l.brokered) { brokeredSales += l.lineTotal; continue }
        ownedSales += l.lineTotal
        const item = scoped.stockItems.find((x) => x.id === l.stockItemId)
        const name = item?.product || l.product || '—'
        const key = l.stockItemId || name
        const m = computeMoney({ gross: l.lineTotal, net: l.lineTotal, costPaid: l.qty * l.unitCost, vatTreatment: vatOf(l.stockItemId) })
        const p = byProduct[key] || (byProduct[key] = { name, units: 0, ladders: [] })
        p.units += l.qty; p.ladders.push(m)
      }
    }
    const products = Object.values(byProduct).map((p) => ({ ...p, t: sumMoney(p.ladders) })).sort((a, b) => b.t.gross - a.t.gross)
    return { monthly, delta, deltaPct, products, brokeredSales, ownedSales }
  }, [r, scoped, field.value, vatOf])

  return (
    <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px' }}>
      {dive.delta != null && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <span style={{ color: '#999' }}>vs previous month: </span>
          <strong style={{ color: dive.delta >= 0 ? '#1a7f37' : '#c82828' }}>
            {dive.delta >= 0 ? '▲ +' : '▼ '}{gbp0(Math.abs(dive.delta))}{dive.deltaPct != null ? ` (${pct(Math.abs(dive.deltaPct))})` : ''}
          </strong>
        </div>
      )}
      {dive.monthly.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Month by month ({LABEL[view]})</div>
          <OverlayChart height={160} labels={dive.monthly.map((x) => monL(x.m))} formatY={gbp0}
            series={[{ label: LABEL[view], colour: '#4a7fe0', points: dive.monthly.map((x, i) => ({ x: i, y: x.t[field.value] })) }]} />
        </div>
      )}
      {dive.brokeredSales > 0 && (
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <span style={{ color: '#999' }}>Owned vs brokered: </span>
          <strong>{gbp0(dive.ownedSales)} owned</strong> · <strong>{gbp0(dive.brokeredSales)} brokered</strong>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Products sold</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 420 }}>
          <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
            <th style={{ textAlign: 'left' }}>Product</th><th>Units</th><th>Gross</th><th>Profit</th><th>Margin</th>
          </tr></thead>
          <tbody>
            {dive.products.map((p) => (
              <tr key={p.name} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '5px 0' }}>{short(p.name)}</td>
                <td>{int(p.units)}</td><td>{gbp0(p.t.gross)}</td>
                <td style={{ color: p.t.trueProfit >= 0 ? '#1a7f37' : '#c82828' }}>{gbp0(p.t.trueProfit)}</td>
                <td>{pct(p.t.netMarginPct)}</td>
              </tr>
            ))}
            {dive.products.length === 0 && <tr><td colSpan={5} style={{ color: '#888', padding: 8 }}>No product lines.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
