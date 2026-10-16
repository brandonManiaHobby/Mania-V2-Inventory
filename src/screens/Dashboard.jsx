import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, pct, int, monthKey, canonPlatform, parseLocalDate, toDateKey, daysBetween, displayDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import OverlayChart from '../components/OverlayChart'
import RangePicker, { rangeDates, rangeLabelOf } from '../components/RangePicker'

// ============================================================
// DASHBOARD (V1 carbon copy + money layers) — the landing page for admin,
// managers and leads. Date range · split-by · measure (money follows the
// gross/net toggle). A stacked, colour-coded CONTRIBUTION chart shows who
// made what over time, with a legend of each series' total. Filters narrow
// by department / platform / stream type / channel. Everything from the
// engine; nothing computed here.
// ============================================================
const SPLITS = [{ k: 'channel', label: 'Channel' }, { k: 'platform', label: 'Platform' }, { k: 'streamer', label: 'Streamer' }, { k: 'department', label: 'Department' }]
const MEASURES = [{ k: 'money', label: 'Money' }, { k: 'hours', label: 'Hours' }, { k: 'shows', label: 'Shows' }]
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}
// stable per-series colour so each channel / platform / streamer reads distinctly
function hueFor(str) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const seriesColour = (k) => `hsl(${hueFor(k)} 62% 52%)`

const mondayOf = (ymd) => { const d = parseLocalDate(ymd); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toDateKey(d) }

export default function Dashboard({ scoped }) {
  const [range, setRange] = useState('thisweek')
  const [cFrom, setCFrom] = useState(null)
  const [cTo, setCTo] = useState(null)
  const [split, setSplit] = useState('channel')
  const [measure, setMeasure] = useState('money')
  const [view, setView] = useState('gross')
  const [fDept, setFDept] = useState('')
  const [fPlatform, setFPlatform] = useState('')
  const [fType, setFType] = useState('')
  const [fChannel, setFChannel] = useState('')
  const field = VIEW_FIELD[view]
  const { from, to } = rangeDates(range, cFrom, cTo)

  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  // Streams in range (+ filters), each with its ladder + hours.
  const streams = useMemo(() => scoped.streams
    .filter((s) => s.streamDate && s.streamDate >= from && s.streamDate <= to)
    .filter((s) => !fDept || (s.department || '—') === fDept)
    .filter((s) => !fPlatform || (canonPlatform(s.platform) || '—') === fPlatform)
    .filter((s) => !fType || (s.streamType || '—') === fType)
    .filter((s) => !fChannel || (s.channel || '—') === fChannel)
    .map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      return { ...s, m, hours: hoursOf(s) }
    }), [scoped, from, to, fDept, fPlatform, fType, fChannel])

  const totals = useMemo(() => sumMoney(streams.map((s) => s.m)), [streams])
  const totalHours = streams.reduce((a, s) => a + s.hours, 0)

  const dimOf = (s) => split === 'platform' ? (canonPlatform(s.platform) || '—') : split === 'channel' ? (s.channel || '—') : split === 'department' ? (s.department || '—') : (s.streamerName || '—')
  const measureVal = (s) => measure === 'hours' ? s.hours : measure === 'shows' ? 1 : s.m[field.value]
  const fmtMeasure = (v) => measure === 'hours' ? v.toFixed(1) + 'h' : measure === 'shows' ? int(v) : gbp0(v)
  const measureName = measure === 'hours' ? 'Hours' : measure === 'shows' ? 'Shows' : LABEL[view]

  // option lists for the filters
  const opts = useMemo(() => {
    const D = new Set(), P = new Set(), T = new Set(), C = new Set()
    for (const s of scoped.streams) {
      if (s.department) D.add(s.department); if (s.platform) P.add(canonPlatform(s.platform))
      if (s.streamType) T.add(s.streamType); if (s.channel) C.add(s.channel)
    }
    const srt = (x) => [...x].sort((a, b) => a.localeCompare(b))
    return { depts: srt(D), platforms: srt(P), types: srt(T), channels: srt(C) }
  }, [scoped])

  // ---- STACKED CONTRIBUTION: time buckets × series ----
  const stacked = useMemo(() => {
    const span = daysBetween(from, to) ?? 0
    const bucketOf = span <= 45 ? (s) => s.streamDate
      : span <= 180 ? (s) => mondayOf(s.streamDate)
        : (s) => monthKey(s.streamDate)
    const bucketLabel = span <= 45 ? (k) => displayDate(k, { day: 'numeric', month: 'short' })
      : span <= 180 ? (k) => 'w/c ' + displayDate(k, { day: 'numeric', month: 'short' })
        : (k) => displayDate(k + '-01', { month: 'short', year: '2-digit' })

    const buckets = {}, seriesTotals = {}
    for (const s of streams) {
      const bk = bucketOf(s); if (!bk) continue
      const d = dimOf(s); const v = measureVal(s)
      const b = buckets[bk] || (buckets[bk] = { key: bk, total: 0, parts: {} })
      b.parts[d] = (b.parts[d] || 0) + v; b.total += v
      seriesTotals[d] = (seriesTotals[d] || 0) + v
    }
    const series = Object.entries(seriesTotals).sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total, colour: seriesColour(name) }))
    const rows = Object.values(buckets).sort((a, b) => (b.key > a.key ? 1 : -1)).map((b) => ({ ...b, label: bucketLabel(b.key) }))
    const maxTotal = Math.max(1, ...rows.map((r) => r.total))
    return { rows, series, maxTotal }
  }, [streams, split, measure, field.value, from, to])

  // monthly overlay (gross vs net) — fixed blue/green, unchanged
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
  const filterSel = { padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', fontSize: 12, background: 'var(--card)', color: 'var(--ink)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <RangePicker value={range} onChange={setRange} cFrom={cFrom} cTo={cTo} onCustom={(f, t) => { setCFrom(f); setCTo(t) }} />
      </div>
      <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
        {range === 'custom' || range === 'all' ? `${displayDate(from, { day: 'numeric', month: 'short', year: '2-digit' })} – ${displayDate(to, { day: 'numeric', month: 'short', year: '2-digit' })}` : rangeLabelOf(range)} · {streams.length} streams · {totalHours.toFixed(1)}h
      </div>

      {/* Headline stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <MoneyToggle view={view} onChange={setView} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={field.margin ? `${pct(totals[field.margin])} margin` : null} />
        <StatCard label="Profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net`} />
        <StatCard label="Rev / hour" value={totalHours > 0 ? gbp0(totals.gross / totalHours) : '—'} />
        <StatCard label="Streams" value={int(streams.length)} sub={`${totalHours.toFixed(1)}h`} />
      </div>

      {/* Stacked contribution */}
      <div style={{ marginTop: 22, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700 }}>Contribution</span>
          <span style={{ fontSize: 12, color: '#999' }}>Split by</span> {seg(SPLITS, split, setSplit)}
          <span style={{ fontSize: 12, color: '#999' }}>Measure</span> {seg(MEASURES, measure, setMeasure)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 14px' }}>
          <FSel value={fDept} set={setFDept} any="All departments" options={opts.depts} style={filterSel} />
          <FSel value={fPlatform} set={setFPlatform} any="All platforms" options={opts.platforms} style={filterSel} />
          <FSel value={fType} set={setFType} any="All stream types" options={opts.types} style={filterSel} />
          <FSel value={fChannel} set={setFChannel} any="All channels" options={opts.channels} style={filterSel} />
        </div>

        {stacked.rows.length === 0 ? <p style={{ color: '#888' }}>No data in range.</p> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {stacked.rows.map((r) => (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 64, fontSize: 12, color: '#777', textAlign: 'right', flex: '0 0 auto' }}>{r.label}</div>
                  <div style={{ flex: 1, display: 'flex', height: 22, background: '#f4f3f0', borderRadius: 6, overflow: 'hidden' }} title={`${fmtMeasure(r.total)} total`}>
                    {stacked.series.filter((se) => r.parts[se.name]).map((se) => (
                      <div key={se.name} title={`${se.name}: ${fmtMeasure(r.parts[se.name])}`}
                        style={{ width: `${(r.parts[se.name] / stacked.maxTotal) * 100}%`, background: se.colour }} />
                    ))}
                  </div>
                  <div style={{ width: 84, textAlign: 'right', fontWeight: 600, fontSize: 12, flex: '0 0 auto' }}>{fmtMeasure(r.total)}</div>
                </div>
              ))}
            </div>
            {/* legend = shared contribution totals for the period */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              {stacked.series.map((se) => (
                <div key={se.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: se.colour, flex: '0 0 auto' }} />
                  <span style={{ fontWeight: 600 }}>{se.name}</span>
                  <span style={{ color: '#666' }}>{fmtMeasure(se.total)}</span>
                  <span style={{ color: '#aaa', fontSize: 11 }}>· {pct(stacked.series.reduce((a, x) => a + x.total, 0) > 0 ? se.total / stacked.series.reduce((a, x) => a + x.total, 0) : 0)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{measureName} by {SPLITS.find((s) => s.k === split).label.toLowerCase()} · stacked per {daysBetween(from, to) <= 45 ? 'day' : daysBetween(from, to) <= 180 ? 'week' : 'month'}</div>
          </>
        )}
      </div>

      {/* Gross vs net overlay — fixed blue/green */}
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

function FSel({ value, set, any, options, style }) {
  const list = value && !options.includes(value) ? [value, ...options] : options
  return (
    <select style={style} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{any}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
