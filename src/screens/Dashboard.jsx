import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, pct, int, monthKey, canonPlatform, parseLocalDate, toDateKey, daysBetween, displayDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'
import StatCard from '../components/StatCard'
import BarsChart from '../components/BarsChart'
import RangePicker, { rangeDates, rangeLabelOf } from '../components/RangePicker'

// ============================================================
// DASHBOARD (V1 carbon copy + money layers) — landing page for admin /
// manager / lead. Stacked, colour-coded CONTRIBUTION chart: each day a bar
// split by the chosen dimension (Department native), each day inspectable
// (hover/tap for the per-series breakdown + total), on a fixed 10k axis that
// grows in 5k steps. Split-by + Measure are visible; the filters live behind a
// Filters tab. Brand colours are fixed (Mania/101 orange, GC Mania burnt
// orange, Mania TCG blue); other series get a stable hue.
// ============================================================
const SPLITS = [{ k: 'department', label: 'Department' }, { k: 'channel', label: 'Channel' }, { k: 'platform', label: 'Platform' }, { k: 'streamer', label: 'Streamer' }]
const MEASURES = [{ k: 'money', label: 'Money' }, { k: 'hours', label: 'Hours' }, { k: 'shows', label: 'Shows' }]
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }

function hoursOf(s) {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}
// Fixed brand colours (V1 parity); anything else gets a stable hue.
const BRAND = { 'mania/101': '#ff6a00', 'mania 101': '#ff6a00', '101': '#ff6a00', 'mania/101 cardbreaks': '#ff6a00', '101 cardbreaks': '#ff6a00', 'mania tcg': '#3a6fd8', 'tcg': '#3a6fd8', 'gc mania': '#c0531f', 'gcmania': '#c0531f', 'gc': '#c0531f' }
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
function hueFor(str) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const seriesColour = (k) => BRAND[norm(k)] || BRAND[norm(k).replace(/[/ ]/g, '')] || `hsl(${hueFor(k)} 62% 52%)`

const mondayOf = (ymd) => { const d = parseLocalDate(ymd); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toDateKey(d) }
const niceCeil = (v) => { if (v <= 0) return 1; const mag = Math.pow(10, Math.floor(Math.log10(v))); const step = mag / 2 || 1; return Math.ceil(v / step) * step }

export default function Dashboard({ scoped }) {
  const [range, setRange] = useState('thisweek')
  const [cFrom, setCFrom] = useState(null)
  const [cTo, setCTo] = useState(null)
  const [split, setSplit] = useState('department')
  const [measure, setMeasure] = useState('money')
  const [view, setView] = useState('gross')
  const [showFilters, setShowFilters] = useState(false)
  const [f, setF] = useState({ dept: '', platform: '', type: '', channel: '', streamer: '' })
  const [tip, setTip] = useState(null)   // { row, x, y } — follows the cursor
  const field = VIEW_FIELD[view]
  const { from, to } = rangeDates(range, cFrom, cTo)
  const activeFilters = Object.values(f).filter(Boolean).length
  const setFilter = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const vatOf = (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'

  const streams = useMemo(() => scoped.streams
    .filter((s) => s.streamDate && s.streamDate >= from && s.streamDate <= to)
    .filter((s) => !f.dept || (s.department || '—') === f.dept)
    .filter((s) => !f.platform || (canonPlatform(s.platform) || '—') === f.platform)
    .filter((s) => !f.type || (s.streamType || '—') === f.type)
    .filter((s) => !f.channel || (s.channel || '—') === f.channel)
    .filter((s) => !f.streamer || (s.streamerName || '—') === f.streamer)
    .map((s) => {
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const m = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })), vatOf)
      return { ...s, m, hours: hoursOf(s) }
    }), [scoped, from, to, f])

  const totals = useMemo(() => sumMoney(streams.map((s) => s.m)), [streams])
  const totalHours = streams.reduce((a, s) => a + s.hours, 0)

  const dimOf = (s) => split === 'platform' ? (canonPlatform(s.platform) || '—') : split === 'channel' ? (s.channel || '—') : split === 'streamer' ? (s.streamerName || '—') : (s.department || '—')
  const measureVal = (s) => measure === 'hours' ? s.hours : measure === 'shows' ? 1 : s.m[field.value]
  const fmtMeasure = (v) => measure === 'hours' ? v.toFixed(1) + 'h' : measure === 'shows' ? int(v) : gbp0(v)
  const measureName = measure === 'hours' ? 'Hours' : measure === 'shows' ? 'Shows' : LABEL[view]

  const opts = useMemo(() => {
    const D = new Set(), P = new Set(), T = new Set(), C = new Set(), S = new Set()
    for (const s of scoped.streams) {
      if (s.department) D.add(s.department); if (s.platform) P.add(canonPlatform(s.platform))
      if (s.streamType) T.add(s.streamType); if (s.channel) C.add(s.channel); if (s.streamerName) S.add(s.streamerName)
    }
    const srt = (x) => [...x].sort((a, b) => a.localeCompare(b))
    return { depts: srt(D), platforms: srt(P), types: srt(T), channels: srt(C), streamers: srt(S) }
  }, [scoped])

  const stacked = useMemo(() => {
    const span = daysBetween(from, to) ?? 0
    const unit = span <= 45 ? 'day' : span <= 180 ? 'week' : 'month'
    const bucketOf = unit === 'day' ? (s) => s.streamDate : unit === 'week' ? (s) => mondayOf(s.streamDate) : (s) => monthKey(s.streamDate)
    const bucketLabel = unit === 'day' ? (k) => displayDate(k, { day: 'numeric', month: 'short' })
      : unit === 'week' ? (k) => 'w/c ' + displayDate(k, { day: 'numeric', month: 'short' })
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
    const maxTotal = Math.max(0, ...rows.map((r) => r.total))
    // fixed 10k axis, grows in 5k steps (money); nice round axis for hours/shows
    let axisMax, step
    if (measure === 'money') { axisMax = maxTotal <= 10000 ? 10000 : Math.ceil(maxTotal / 5000) * 5000; step = 5000 }
    else { axisMax = niceCeil(maxTotal || 1); step = axisMax / 4 }
    const ticks = []; for (let v = 0; v <= axisMax + 0.001; v += step) ticks.push(v)
    return { rows, series, axisMax, ticks, unit }
  }, [streams, split, measure, field.value, from, to])

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
  const grandTotal = stacked.series.reduce((a, x) => a + x.total, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <RangePicker value={range} onChange={setRange} cFrom={cFrom} cTo={cTo} onCustom={(a, b) => { setCFrom(a); setCTo(b) }} />
      </div>
      <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
        {range === 'custom' || range === 'all' ? `${displayDate(from, { day: 'numeric', month: 'short', year: '2-digit' })} – ${displayDate(to, { day: 'numeric', month: 'short', year: '2-digit' })}` : rangeLabelOf(range)} · {streams.length} streams · {totalHours.toFixed(1)}h
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <MoneyToggle view={view} onChange={setView} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <StatCard label={LABEL[view]} value={gbp0(totals[field.value])} sub={field.margin ? `${pct(totals[field.margin])} margin` : null} />
        <StatCard label="Profit" value={gbp0(totals.trueProfit)} accent="#1a7f37" sub={`${pct(totals.netMarginPct)} net`} />
        <StatCard label="Rev / hour" value={totalHours > 0 ? gbp0(totals.gross / totalHours) : '—'} />
        <StatCard label="Streams" value={int(streams.length)} sub={`${totalHours.toFixed(1)}h`} />
      </div>

      {/* Contribution */}
      <div style={{ marginTop: 22, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700 }}>Contribution</span>
          <span style={{ fontSize: 12, color: '#999' }}>Split by</span> {seg(SPLITS, split, setSplit)}
          <span style={{ fontSize: 12, color: '#999' }}>Measure</span> {seg(MEASURES, measure, setMeasure)}
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button onClick={() => setShowFilters((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (activeFilters ? 'var(--orange)' : '#ddd'), background: activeFilters ? 'rgba(255,106,0,0.08)' : '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600 }}>
              ⚙ Filters{activeFilters ? ` · ${activeFilters}` : ''} {showFilters ? '▴' : '▾'}
            </button>
            {showFilters && (
              <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 14, width: 240, display: 'grid', gap: 10 }}>
                <FRow label="Department" value={f.dept} set={(v) => setFilter('dept', v)} any="All departments" options={opts.depts} />
                <FRow label="Platform" value={f.platform} set={(v) => setFilter('platform', v)} any="All platforms" options={opts.platforms} />
                <FRow label="Stream type" value={f.type} set={(v) => setFilter('type', v)} any="All stream types" options={opts.types} />
                <FRow label="Channel" value={f.channel} set={(v) => setFilter('channel', v)} any="All channels" options={opts.channels} />
                <FRow label="Streamer" value={f.streamer} set={(v) => setFilter('streamer', v)} any="All streamers" options={opts.streamers} />
                {activeFilters > 0 && <button onClick={() => setF({ dept: '', platform: '', type: '', channel: '', streamer: '' })} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer', font: 'inherit', fontSize: 12 }}>Clear filters</button>}
              </div>
            )}
          </div>
        </div>

        {stacked.rows.length === 0 ? <p style={{ color: '#888' }}>No data in range.</p> : (
          <>
            <div style={{ position: 'relative' }}>
              {/* gridlines overlay aligned to the track column (60px label + 10 gap … 84px total + 10 gap) */}
              <div style={{ position: 'absolute', left: 70, right: 94, top: 0, bottom: 22, pointerEvents: 'none' }}>
                {stacked.ticks.map((v, i) => (
                  <div key={v} style={{ position: 'absolute', left: `${(v / stacked.axisMax) * 100}%`, top: 0, bottom: 0, borderLeft: i === 0 ? '1px solid #e8e6e2' : '1px dashed #eee' }} />
                ))}
              </div>

              {stacked.rows.map((r) => (
                <div key={r.key}
                  onMouseMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTip((t) => (t && t.row.key === r.key ? null : t))}
                  style={{ display: 'grid', gridTemplateColumns: '60px 1fr 84px', columnGap: 10, alignItems: 'center', padding: '6px 0', cursor: 'crosshair' }}>
                  <div style={{ fontSize: 12, color: '#777', textAlign: 'right' }}>{r.label}</div>
                  <div style={{ display: 'flex', height: 34, background: '#f7f6f3', borderRadius: 7, overflow: 'hidden', outline: tip && tip.row.key === r.key ? '2px solid rgba(255,106,0,0.35)' : 'none' }}>
                    {stacked.series.filter((se) => r.parts[se.name]).map((se) => (
                      <div key={se.name} style={{ width: `${(r.parts[se.name] / stacked.axisMax) * 100}%`, background: se.colour }} />
                    ))}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtMeasure(r.total)}</div>
                </div>
              ))}

              {/* axis labels */}
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 84px', columnGap: 10, marginTop: 2 }}>
                <span />
                <div style={{ position: 'relative', height: 16 }}>
                  {stacked.ticks.map((v, i) => (
                    <span key={v} style={{ position: 'absolute', left: `${(v / stacked.axisMax) * 100}%`, transform: i === 0 ? 'none' : i === stacked.ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>{measure === 'money' ? gbp0(v) : measure === 'hours' ? v + 'h' : v}</span>
                  ))}
                </div>
                <span />
              </div>
            </div>

            {/* legend = shared contribution totals */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              {stacked.series.map((se) => (
                <div key={se.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: se.colour, flex: '0 0 auto' }} />
                  <span style={{ fontWeight: 600 }}>{se.name}</span>
                  <span style={{ color: '#666' }}>{fmtMeasure(se.total)}</span>
                  <span style={{ color: '#aaa', fontSize: 11 }}>· {pct(grandTotal > 0 ? se.total / grandTotal : 0)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{measureName} by {SPLITS.find((s) => s.k === split).label.toLowerCase()} · stacked per {stacked.unit} · hover a {stacked.unit} to inspect</div>
          </>
        )}
      </div>

      {/* Revenue by month — bars + projection trend */}
      <div style={{ marginTop: 18, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Revenue by month — with projection</div>
        {monthly.ms.length === 0 ? <p style={{ color: '#888' }}>No data.</p> : (
          <BarsChart labels={monthly.ms.map((m) => displayDate(m + '-01', { month: 'short', year: '2-digit' }))}
            values={monthly.data.map((d) => d.g)} formatY={gbp0} projLabel="Projected" />
        )}
      </div>

      {/* Cursor-following tooltip for the contribution chart */}
      {tip && (
        <div style={{ position: 'fixed', left: Math.min(tip.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 240), top: tip.y + 16, zIndex: 80, pointerEvents: 'none', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '10px 12px', minWidth: 210 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{tip.row.label}</div>
          {stacked.series.filter((se) => tip.row.parts[se.name]).map((se) => (
            <div key={se.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: se.colour, flex: '0 0 auto' }} />
              <span style={{ flex: 1 }}>{se.name}</span>
              <span style={{ fontWeight: 600 }}>{fmtMeasure(tip.row.parts[se.name])}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--line)', fontWeight: 800 }}>
            <span>Total</span><span>{fmtMeasure(tip.row.total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function FRow({ label, value, set, any, options }) {
  const list = value && !options.includes(value) ? [value, ...options] : options
  const sel = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', fontSize: 12, background: 'var(--card)', color: 'var(--ink)', marginTop: 3 }
  return (
    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}
      <select style={sel} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">{any}</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
