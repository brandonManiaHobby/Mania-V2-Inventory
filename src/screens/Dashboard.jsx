import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, pct, int, monthKey } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import OverlayChart from '../components/OverlayChart'
import RangePicker, { rangeDates } from '../components/RangePicker'

// ============================================================
// DASHBOARD (Stage 5, FULL DEPTH — V1 parity + money layers)
// Date range · split-by (platform/channel/streamer) · measure follows the
// money toggle PLUS hours. Configurable bar chart + breakdown table + the
// gross/net overlay. Everything from the engine; nothing computed here.
// ============================================================
const SPLITS = [{ k: 'platform', label: 'Platform' }, { k: 'channel', label: 'Channel' }, { k: 'streamer', label: 'Streamer' }]
const MEASURES = [
  { k: 'money', label: 'Money' },   // follows the money toggle
  { k: 'hours', label: 'Hours' },
  { k: 'shows', label: 'Shows' },
]

function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}

export default function Dashboard({ scoped }) {
  const [range, setRange] = useState('30d')
  const [split, setSplit] = useState('platform')
  const [measure, setMeasure] = useState('money')
  const [view, setView] = useState('gross')
  const field = VIEW_FIELD[view]
  const { from, to } = rangeDates(range)

  // Streams in range, each with its ladder + hours.
  const streams = useMemo(() => scoped.streams
    .filter((s) => s.streamDate && s.streamDate >= from && s.streamDate <= to)
    .map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })),
        (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard')
      return { ...s, m, hours: hoursOf(s) }
    }), [scoped, from, to])

  const totals = useMemo(() => sumMoney(streams.map((s) => s.m)), [streams])
  const totalHours = streams.reduce((a, s) => a + s.hours, 0)

  // measure value for a stream (money follows toggle)
  const measureVal = (s) => measure === 'hours' ? s.hours : measure === 'shows' ? 1 : s.m[field.value]
  const fmtMeasure = (v) => measure === 'hours' ? v.toFixed(1) + 'h' : measure === 'shows' ? int(v) : gbp0(v)

  // split dimension value
  const dimOf = (s) => split === 'platform' ? (s.platform || '—') : split === 'channel' ? (s.channel || '—') : (s.streamerName || '—')

  // grouped breakdown
  const groups = useMemo(() => {
    const g = {}
    for (const s of streams) {
      const d = dimOf(s)
      g[d] = g[d] || { dim: d, ladders: [], hours: 0, shows: 0 }
      g[d].ladders.push(s.m); g[d].hours += s.hours; g[d].shows += 1
    }
    return Object.values(g).map((x) => {
      const t = sumMoney(x.ladders)
      const mv = measure === 'hours' ? x.hours : measure === 'shows' ? x.shows : t[field.value]
      return { ...x, t, mv, revPerHour: x.hours > 0 ? t.gross / x.hours : 0 }
    }).sort((a, b) => b.mv - a.mv)
  }, [streams, split, measure, field.value])

  // monthly overlay (gross vs net)
  const monthly = useMemo(() => {
    const bm = {}
    for (const s of streams) { const m = monthKey(s.streamDate); if (!m) continue; bm[m] = bm[m] || { g: 0, n: 0 }; bm[m].g += s.m.gross; bm[m].n += s.m.net }
    const ms = Object.keys(bm).sort(); return { ms, data: ms.map((m) => bm[m]) }
  }, [streams])

  const seg = (items, val, set) => (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
      {items.map((o) => (
        <button key={o.k} onClick={() => set(o.k)} style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: val === o.k ? 700 : 400, background: val === o.k ? '#fff' : 'transparent' }}>{o.label}</button>
      ))}
    </div>
  )

  const maxG = Math.max(1, ...groups.map((g) => g.mv))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {/* Headline stats (money toggle) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <MoneyToggle view={view} onChange={setView} />
        <span style={{ fontSize: 12, color: '#999' }}>{streams.length} streams · {totalHours.toFixed(1)}h</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={field.margin ? `${pct(totals[field.margin])} margin` : null} />
        <StatCard label="Fees paid" value={gbp0(totals.fees)} accent="#c0392b" />
        <StatCard label="VAT owed" value={gbp0(totals.vatOwed)} accent="#b8700a" />
        <StatCard label="True profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net`} />
        <StatCard label="Rev / hour" value={totalHours > 0 ? gbp0(totals.gross / totalHours) : '—'} />
      </div>

      {/* Configurable breakdown */}
      <div style={{ marginTop: 22, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700 }}>Breakdown</span>
          <span style={{ fontSize: 12, color: '#999' }}>Split by</span> {seg(SPLITS, split, setSplit)}
          <span style={{ fontSize: 12, color: '#999' }}>Measure</span> {seg(MEASURES, measure, setMeasure)}
        </div>
        {groups.length === 0 ? <p style={{ color: '#888' }}>No data in range.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.map((g) => (
              <div key={g.dim} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 120, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.dim}</div>
                <div style={{ flex: 1, height: 20, background: '#f4f3f0', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${(g.mv / maxG) * 100}%`, height: '100%', background: '#4a7fe0', borderRadius: 6 }} />
                </div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtMeasure(g.mv)}</div>
                <div style={{ width: 70, textAlign: 'right', fontSize: 11, color: '#999' }}>{g.shows} shw</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gross vs net overlay */}
      <div style={{ marginTop: 18, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Revenue by month — gross vs net</div>
        {monthly.ms.length === 0 ? <p style={{ color: '#888' }}>No data.</p> : (
          <OverlayChart labels={monthly.ms} formatY={gbp0}
            series={[
              { label: 'Gross', colour: '#4a7fe0', points: monthly.data.map((d, i) => ({ x: i, y: d.g })) },
              { label: 'Net', colour: '#1a7f37', points: monthly.data.map((d, i) => ({ x: i, y: d.n })) },
            ]} />
        )}
      </div>
    </div>
  )
}
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
