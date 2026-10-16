import { useMemo, useState } from 'react'
import { exVat, vatOfInclusive } from '../money'
import { gbp, gbp0, int, pct, todayKey, toDateKey, parseLocalDate, displayDate, vatTreatmentOf, shortName, canonPlatform } from '../data'

// ============================================================
// REPORT BUILDER (Reporting) — an infinitely drillable, composable pivot.
//   Break down by  [ 0..N ordered dimensions ]   drill: Streamer › Product › …
//   Measure        [ an ordered STACK of metrics ]  add/remove/reorder columns
//   Between        [ date range ]                presets · month/week · custom
//   Narrow to      [ optional filters ]          pin streamer/channel/…/product
//   + click any row -> a focus panel for that entity (profit by product,
//     most-used stock, hours, splits by the other dimensions).
//
// Nothing is required. No breakdown -> one overall total. Every figure runs
// through the SAME money engine as the rest of the app (per-line net
// allocation, VAT per product) so a report can never disagree with Finance.
// No AI, no cost, instant.
// ============================================================

const DIMENSIONS = [
  { id: 'streamer', label: 'Streamer', get: (s) => s.streamerName || '—' },
  { id: 'channel',  label: 'Channel',  get: (s) => s.channel || '—' },
  { id: 'platform', label: 'Platform', get: (s) => canonPlatform(s.platform) || '—' },
  { id: 'product',  label: 'Product',  get: (s, l) => shortName(l.product || '—') },
]
const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d]))

const METRICS = [
  { id: 'revenue', label: 'Revenue',      pick: (g) => g.gross,  fmt: gbp0 },
  { id: 'net',     label: 'Net',          pick: (g) => g.net,    fmt: gbp0 },
  { id: 'fees',    label: 'Fees',         pick: (g) => g.fees,   fmt: gbp0 },
  { id: 'profit',  label: 'Profit',       pick: (g) => g.profit, fmt: gbp0, good: true },
  { id: 'units',   label: 'Units (usage)', pick: (g) => g.units, fmt: int },
  { id: 'streams', label: 'Streams',      pick: (g) => g.streams, fmt: int },
  { id: 'hours',   label: 'Hours',        pick: (g) => g.hours,  fmt: (h) => (h > 0 ? h.toFixed(1) : '—') },
  { id: 'ppu',     label: 'Profit / unit', pick: (g) => (g.units > 0 ? g.profit / g.units : 0), fmt: gbp, good: true },
  { id: 'rph',     label: 'Rev / hour',   pick: (g) => (g.hours > 0 ? g.gross / g.hours : 0), fmt: gbp0 },
  { id: 'margin',  label: 'Margin %',     pick: (g) => (g.gross > 0 ? g.profit / g.gross : 0), fmt: pct },
]
const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]))

const hoursOf = (s) => {
  if (!s.streamStart || !s.streamEnd) return 0
  const p = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) + (m || 0) / 60 }
  const d = p(s.streamEnd) - p(s.streamStart); return d > 0 ? d : 0
}

const RANGE_PRESETS = [
  { id: 'this_week', label: 'This week' }, { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' }, { id: 'last_month', label: 'Last month' },
  { id: 'last_2m', label: 'Last 2 months' }, { id: 'last_3m', label: 'Last 3 months' },
  { id: 'this_year', label: 'This year' }, { id: 'lifetime', label: 'Lifetime' },
  { id: 'month', label: 'A specific month…' }, { id: 'custom', label: 'Custom dates…' },
]
const mondayOf = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const emptyMeasures = () => ({ gross: 0, net: 0, fees: 0, profit: 0, units: 0, cost: 0 })
function aggregate(recs, hoursById) {
  const m = emptyMeasures(); const sids = new Set()
  for (const r of recs) { m.gross += r.gross; m.net += r.net; m.fees += r.fees; m.profit += r.profit; m.units += r.units; m.cost += r.cost; sids.add(r.sid) }
  let hours = 0; sids.forEach((id) => { hours += hoursById[id] || 0 })
  return { ...m, streams: sids.size, hours }
}
// group a flat record set by one dimension -> aggregated rows
function groupByDim(recs, dimId, hoursById) {
  const b = new Map()
  for (const r of recs) { const k = DIM[dimId].get(r.s, r.l); if (!b.has(k)) b.set(k, []); b.get(k).push(r) }
  return [...b.entries()].map(([key, rs]) => ({ key, ...aggregate(rs, hoursById) }))
}

export default function ReportBuilder({ scoped }) {
  const today = todayKey()
  const vatOf = (sid) => vatTreatmentOf(scoped, sid)

  const [dims, setDims] = useState(['streamer'])
  const [metricIds, setMetricIds] = useState(['revenue', 'profit', 'units'])
  const [range, setRange] = useState('last_month')
  const [monthSel, setMonthSel] = useState(today.slice(0, 7))
  const [weekSel, setWeekSel] = useState('all')
  const [cFrom, setCFrom] = useState(today.slice(0, 5) + '01-01')
  const [cTo, setCTo] = useState(today)
  const [fStreamer, setFStreamer] = useState('')
  const [fChannel, setFChannel] = useState('')
  const [fPlatform, setFPlatform] = useState('')
  const [fProduct, setFProduct] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [focus, setFocus] = useState(null)   // array of {dim,key} constraints

  const selectedMetrics = metricIds.map((id) => METRIC_BY_ID[id]).filter(Boolean)
  const toggleDim = (id) => setDims((ds) => ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id])
  const addMetric = (id) => { if (id) setMetricIds((l) => l.includes(id) ? l : [...l, id]) }
  const removeMetric = (id) => setMetricIds((l) => l.filter((x) => x !== id))
  const moveMetric = (id, dir) => setMetricIds((l) => { const i = l.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n })

  // Filter option lists are CONTEXT-AWARE: each dropdown offers only values
  // that actually occur given the OTHER active filters + date window. So pin
  // an entertainment streamer and the Product list shows only what they ran —
  // no catalogue stock they never touched.
  const linesOf = useMemo(() => {
    const byStream = {}
    for (const l of scoped.streamLines) {
      if (l.brokered || l.lineKind === 'giveaway' || !l.product) continue
      ;(byStream[l.streamId] || (byStream[l.streamId] = [])).push(shortName(l.product))
    }
    return byStream
  }, [scoped])

  const opts = useMemo(() => {
    const inRange = scoped.streams.filter((s) => !(s.streamDate && (s.streamDate < from || s.streamDate > to)))
    const prods = (s) => linesOf[s.id] || []
    const okStreamer = (s) => !fStreamer || (s.streamerName || '—') === fStreamer
    const okChannel = (s) => !fChannel || (s.channel || '—') === fChannel
    const okPlatform = (s) => !fPlatform || (canonPlatform(s.platform) || '—') === fPlatform
    const okProduct = (s) => !fProduct || prods(s).includes(fProduct)
    const S = new Set(), C = new Set(), P = new Set(), PR = new Set()
    for (const s of inRange) {
      if (okChannel(s) && okPlatform(s) && okProduct(s) && s.streamerName) S.add(s.streamerName)
      if (okStreamer(s) && okPlatform(s) && okProduct(s) && s.channel) C.add(s.channel)
      if (okStreamer(s) && okChannel(s) && okProduct(s) && s.platform) P.add(canonPlatform(s.platform))
      if (okStreamer(s) && okChannel(s) && okPlatform(s)) prods(s).forEach((p) => PR.add(p))
    }
    const srt = (set) => [...set].sort((a, b) => a.localeCompare(b))
    return { streamers: srt(S), channels: srt(C), platforms: srt(P), products: srt(PR) }
  }, [scoped, linesOf, from, to, fStreamer, fChannel, fPlatform, fProduct])

  const { from, to, rangeLabel } = useMemo(() => {
    const t = parseLocalDate(today), key = toDateKey
    if (range === 'lifetime') { const ds = scoped.streams.map((s) => s.streamDate).filter(Boolean).sort(); return { from: ds[0] || '2000-01-01', to: today, rangeLabel: 'lifetime' } }
    if (range === 'this_week') { const m = mondayOf(t); return { from: key(m), to: today, rangeLabel: 'this week' } }
    if (range === 'last_week') { const m = mondayOf(t); return { from: key(addDays(m, -7)), to: key(addDays(m, -1)), rangeLabel: 'last week' } }
    if (range === 'this_month') return { from: today.slice(0, 8) + '01', to: today, rangeLabel: 'this month' }
    if (range === 'last_month') { const d = new Date(t.getFullYear(), t.getMonth() - 1, 1), end = new Date(t.getFullYear(), t.getMonth(), 0); return { from: key(d), to: key(end), rangeLabel: 'last month' } }
    if (range === 'last_2m') { const d = new Date(t); d.setMonth(d.getMonth() - 2); return { from: key(d), to: today, rangeLabel: 'the last 2 months' } }
    if (range === 'last_3m') { const d = new Date(t); d.setMonth(d.getMonth() - 3); return { from: key(d), to: today, rangeLabel: 'the last 3 months' } }
    if (range === 'this_year') return { from: today.slice(0, 5) + '01-01', to: today, rangeLabel: 'this year' }
    if (range === 'month') {
      const [y, m] = monthSel.split('-').map(Number)
      const first = new Date(y, m - 1, 1), last = new Date(y, m, 0)
      const name = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      if (weekSel === 'all') return { from: key(first), to: key(last), rangeLabel: name }
      const wk = Number(weekSel), ws = new Date(y, m - 1, 1 + (wk - 1) * 7), we = new Date(y, m - 1, Math.min(wk * 7, last.getDate()))
      return { from: key(ws), to: key(we), rangeLabel: `week ${wk} of ${name}` }
    }
    return { from: cFrom, to: cTo, rangeLabel: `${cFrom} → ${cTo}` }
  }, [range, monthSel, weekSel, cFrom, cTo, today, scoped])

  const records = useMemo(() => {
    const recs = []
    for (const s of scoped.streams) {
      if (s.streamDate && (s.streamDate < from || s.streamDate > to)) continue
      if (fStreamer && (s.streamerName || '—') !== fStreamer) continue
      if (fChannel && (s.channel || '—') !== fChannel) continue
      if (fPlatform && (canonPlatform(s.platform) || '—') !== fPlatform) continue
      const allLive = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered && l.lineKind !== 'giveaway')
      if (allLive.length === 0) continue
      const grossOfLines = allLive.reduce((a, l) => a + (Number(l.lineTotal) || 0), 0) || Number(s.totalSales) || 1
      const net = (s.net === null || s.net === undefined) ? Number(s.totalSales) || 0 : Number(s.net) || 0
      const lines = fProduct ? allLive.filter((l) => shortName(l.product || '—') === fProduct) : allLive
      for (const l of lines) {
        const qty = Number(l.qty) || 0, t = vatOf(l.stockItemId), lineGross = Number(l.lineTotal) || 0
        const share = grossOfLines > 0 ? (lineGross / grossOfLines) * net : 0
        const netExVat = share - vatOfInclusive(share, t)
        const cost = qty * (Number(l.unitCost) || 0)
        const profit = netExVat - exVat(cost, t)
        recs.push({ sid: s.id, s, l, gross: lineGross, net: share, fees: lineGross - share, profit, units: qty, cost })
      }
    }
    return recs
  }, [scoped, from, to, fStreamer, fChannel, fPlatform, fProduct])

  const hoursById = useMemo(() => { const h = {}; for (const s of scoped.streams) h[s.id] = hoursOf(s); return h }, [scoped])

  const { tree, totals, expandablePaths } = useMemo(() => {
    const sm = (sortKey && METRIC_BY_ID[sortKey]) || selectedMetrics[0] || METRICS[0]
    const paths = []
    const build = (recs, order, parentPath) => {
      const [dimId, ...rest] = order
      const buckets = new Map()
      for (const r of recs) { const k = DIM[dimId].get(r.s, r.l); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r) }
      const nodes = [...buckets.entries()].map(([key, rs]) => {
        const path = parentPath + '¦' + key
        const node = { key, path, ...aggregate(rs, hoursById), children: rest.length ? build(rs, rest, path) : null }
        if (node.children) paths.push(path)
        return node
      })
      nodes.sort((a, b) => sm.pick(b) - sm.pick(a))
      return nodes
    }
    const tot = aggregate(records, hoursById)
    const tr = dims.length === 0
      ? [{ key: 'Overall', path: '¦overall', ...tot, children: null }]
      : build(records, dims, '')
    return { tree: tr, totals: tot, expandablePaths: paths }
  }, [records, dims, hoursById, sortKey, selectedMetrics])

  const visibleRows = useMemo(() => {
    const out = []
    const walk = (nodes, depth, trail) => {
      for (const n of nodes) {
        const myTrail = dims[depth] ? [...trail, { dim: dims[depth], key: n.key }] : trail
        const hasKids = Array.isArray(n.children) && n.children.length > 0
        out.push({ node: n, depth, hasKids, trail: myTrail })
        if (hasKids && expanded.has(n.path)) walk(n.children, depth + 1, myTrail)
      }
    }
    walk(tree, 0, [])
    return out
  }, [tree, expanded, dims])

  const dimLabels = dims.map((d) => DIM[d].label)
  const metricNames = selectedMetrics.map((m) => m.label).join(' · ') || '—'
  const filterBits = [fStreamer, fChannel, fPlatform, fProduct].filter(Boolean)
  const primaryMetric = selectedMetrics[0]
  const primaryMax = Math.max(1, ...tree.map((n) => (primaryMetric ? Math.abs(primaryMetric.pick(n)) : 0)))
  const availableToAdd = METRICS.filter((m) => !metricIds.includes(m.id))

  const expandAll = () => setExpanded(new Set(expandablePaths))
  const collapseAll = () => setExpanded(new Set())
  const toggleRow = (path) => setExpanded((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })

  const downloadCsv = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const cell = (m, g) => { const v = m.pick(g); return m.fmt === pct ? (v * 100).toFixed(1) + '%' : (typeof v === 'number' ? (m.fmt === int ? Math.round(v) : v.toFixed(2)) : v) }
    const leaves = []
    const walk = (nodes, trail) => { for (const n of nodes) { const t = [...trail, n.key]; if (n.children && n.children.length) walk(n.children, t); else leaves.push({ trail: t, node: n }) } }
    walk(tree, [])
    const header = [...dimLabels, ...selectedMetrics.map((m) => m.label)]
    const out = [esc(`Mania report — ${metricNames} by ${dimLabels.join(' › ') || 'Overall'} · ${rangeLabel}${filterBits.length ? ' · ' + filterBits.join(', ') : ''}`), '', header.join(',')]
    leaves.forEach(({ trail, node }) => out.push([...trail.map(esc), ...selectedMetrics.map((m) => cell(m, node))].join(',')))
    out.push('', [...dimLabels.map(() => ''), ...selectedMetrics.map((m) => cell(m, totals))].map((v, i) => i === 0 ? 'TOTAL' : v).join(','))
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `mania-report-${dims.join('-') || 'overall'}-${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const field = { padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const stepLbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', fontWeight: 800, marginBottom: 6 }
  const th = { textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 10px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', fontSize: 13, borderTop: '1px solid var(--line)', textAlign: 'right' }
  const headerLabel = dimLabels.length ? dimLabels.join(' › ') : 'Overall'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="h2" style={{ margin: 0 }}>Report builder</h2>
        <button className="btn" onClick={downloadCsv} disabled={selectedMetrics.length === 0}>Export CSV</button>
      </div>

      <p className="note" style={{ fontSize: 14, marginTop: 6 }}>
        {dims.length === 0 ? <>Overall <strong>{metricNames}</strong></> : <>Break down <strong>{headerLabel}</strong> by <strong>{metricNames}</strong></>}
        {' '}between <strong>{rangeLabel}</strong>
        {filterBits.length > 0 && <> where <strong>{filterBits.join(' · ')}</strong></>}
      </p>

      <div className="panel" style={{ display: 'grid', gap: 16 }}>
        {/* STEP 1 — breakdown */}
        <div>
          <div style={stepLbl}>Break down by <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>— tap in order to drill; tap again to remove</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {DIMENSIONS.map((d) => {
              const pos = dims.indexOf(d.id)
              return (
                <button key={d.id} className={'chip' + (pos >= 0 ? ' on' : '')} onClick={() => toggleDim(d.id)}>
                  {pos >= 0 && <span style={{ fontWeight: 800, marginRight: 5, opacity: 0.8 }}>{pos + 1}</span>}{d.label}
                </button>
              )
            })}
            {dims.length === 0 && <span className="note" style={{ marginLeft: 4 }}>No breakdown — one overall total.</span>}
            {dims.length > 0 && <button className="chip" onClick={() => setDims([])} title="Clear breakdown">✕ clear</button>}
          </div>
          {dims.length > 1 && <div className="note" style={{ marginTop: 6 }}>Drill: {dimLabels.join(' › ')}</div>}
        </div>

        {/* STEP 2 — metric STACK (add / remove / reorder) */}
        <div>
          <div style={stepLbl}>Measure <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>— stack as many columns as you like, in order</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedMetrics.map((m, i) => (
              <span key={m.id} className="chip on" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
                <button onClick={() => moveMetric(m.id, -1)} disabled={i === 0} title="Move left" style={tagBtn(i === 0)}>◀</button>
                {m.label}
                <button onClick={() => moveMetric(m.id, 1)} disabled={i === selectedMetrics.length - 1} title="Move right" style={tagBtn(i === selectedMetrics.length - 1)}>▶</button>
                <button onClick={() => removeMetric(m.id)} title="Remove" style={{ ...tagBtn(false), fontWeight: 800 }}>×</button>
              </span>
            ))}
            {availableToAdd.length > 0 && (
              <select style={{ ...field, padding: '7px 9px' }} value="" onChange={(e) => { addMetric(e.target.value); e.target.value = '' }}>
                <option value="">➕ Add metric…</option>
                {availableToAdd.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            )}
            {selectedMetrics.length === 0 && <span className="note">Add at least one metric.</span>}
          </div>
        </div>

        {/* STEP 3 — date range */}
        <div>
          <div style={stepLbl}>Between</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={field} value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGE_PRESETS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {range === 'month' && (
              <>
                <input type="month" style={field} value={monthSel} max={today.slice(0, 7)} onChange={(e) => setMonthSel(e.target.value)} />
                <select style={field} value={weekSel} onChange={(e) => setWeekSel(e.target.value)}>
                  <option value="all">Whole month</option>
                  {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Week {w}</option>)}
                </select>
              </>
            )}
            {range === 'custom' && (
              <>
                <input type="date" style={field} value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} />
                <span className="note">to</span>
                <input type="date" style={field} value={cTo} min={cFrom} max={today} onChange={(e) => setCTo(e.target.value)} />
              </>
            )}
            <span className="note">{displayDate(from, { day: 'numeric', month: 'short', year: '2-digit' })} – {displayDate(to, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
          </div>
        </div>

        {/* STEP 4 — optional filters */}
        <div>
          <div style={stepLbl}>Narrow to <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Filter label="Streamer" value={fStreamer} set={setFStreamer} options={opts.streamers} field={field} />
            <Filter label="Channel" value={fChannel} set={setFChannel} options={opts.channels} field={field} />
            <Filter label="Platform" value={fPlatform} set={setFPlatform} options={opts.platforms} field={field} />
            <Filter label="Product" value={fProduct} set={setFProduct} options={opts.products} field={field} />
          </div>
        </div>
      </div>

      {/* RESULT */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '14px 2px 6px' }}>
        <div className="note" style={{ margin: 0 }}>{tree.length} top-level {dims.length ? DIM[dims[0]].label.toLowerCase() : 'row'}{tree.length === 1 ? '' : 's'} · click a row to focus it</div>
        {dims.length > 1 && expandablePaths.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="chip" onClick={expandAll}>Expand all</button>
            <button className="chip" onClick={collapseAll}>Collapse all</button>
          </div>
        )}
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        {selectedMetrics.length === 0 ? (
          <p className="note" style={{ marginTop: 0 }}>Add at least one metric to measure.</p>
        ) : visibleRows.length === 0 ? (
          <p className="note" style={{ marginTop: 0 }}>Nothing matches — try a wider date range or fewer filters.</p>
        ) : (
          <table style={{ minWidth: 520, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>{headerLabel}</th>
                {selectedMetrics.map((m) => (
                  <th key={m.id} style={th} onClick={() => setSortKey(m.id)} title="Sort by this">{m.label}{(sortKey || selectedMetrics[0].id) === m.id ? ' ↓' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ node, depth, hasKids, trail }) => (
                <tr key={node.path} style={{ background: depth > 0 ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'left', position: 'relative' }}>
                    {depth === 0 && primaryMetric && (
                      <span style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: `${Math.max(2, (Math.abs(primaryMetric.pick(node)) / primaryMax) * 100)}%`, background: barColour(node.key), borderRadius: 6, zIndex: 0 }} />
                    )}
                    <span style={{ position: 'relative', zIndex: 1, paddingLeft: depth * 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {hasKids ? (
                        <button onClick={() => toggleRow(node.path)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', font: 'inherit', width: 14, padding: 0 }}>{expanded.has(node.path) ? '▾' : '▸'}</button>
                      ) : <span style={{ width: 14, display: depth > 0 ? 'inline-block' : 'none' }} />}
                      {depth === 0 && <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColour(node.key), flex: '0 0 auto' }} />}
                      <button onClick={() => setFocus(trail)} title="Focus this — profit by product, most-used stock, splits"
                        style={{ border: 'none', background: 'none', font: 'inherit', cursor: 'pointer', color: 'var(--ink)', fontWeight: depth === 0 ? 700 : 400, textAlign: 'left', padding: 0, textDecoration: 'underline', textDecorationColor: 'rgba(255,106,0,0.4)', textUnderlineOffset: 3 }}>
                        {node.key}
                      </button>
                    </span>
                  </td>
                  {selectedMetrics.map((m) => (
                    <td key={m.id} style={{ ...td, fontWeight: m.id === (sortKey || selectedMetrics[0].id) && depth === 0 ? 700 : 400, color: m.good ? (m.pick(node) >= 0 ? 'var(--good)' : 'var(--red)') : 'var(--ink)' }}>{m.fmt(m.pick(node))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, borderTop: '2px solid var(--line)' }}>Total</td>
                {selectedMetrics.map((m) => (
                  <td key={m.id} style={{ ...td, fontWeight: 800, borderTop: '2px solid var(--line)', color: m.good ? (m.pick(totals) >= 0 ? 'var(--good)' : 'var(--red)') : 'var(--ink)' }}>{m.fmt(m.pick(totals))}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {focus && <FocusPanel constraints={focus} records={records} hoursById={hoursById} rangeLabel={rangeLabel} onClose={() => setFocus(null)} />}
    </div>
  )
}

function Filter({ label, value, set, options, field }) {
  const list = value && !options.includes(value) ? [value, ...options] : options
  return (
    <label style={{ fontSize: 12, color: 'var(--muted)' }}>{label}<br />
      <select style={{ ...field, marginTop: 4, minWidth: 150 }} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Any {label.toLowerCase()}</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

const tagBtn = (disabled) => ({ border: 'none', background: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 0.7, font: 'inherit', fontSize: 11, padding: 0, color: 'inherit' })

// Deterministic colour per entity name — same streamer/channel/platform always
// gets the same hue. Optical only (Report builder); the Dashboard keeps its
// blue-gross / green-net scheme untouched.
function hueFor(str) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const dotColour = (key) => `hsl(${hueFor(key)} 62% 52%)`
const barColour = (key) => `hsla(${hueFor(key)} 70% 52% / 0.16)`

// ---- Focus panel: a full drill-to-detail for one clicked entity ----
function FocusPanel({ constraints, records, hoursById, rangeLabel, onClose }) {
  const recs = useMemo(() => records.filter((r) => constraints.every((c) => DIM[c.dim].get(r.s, r.l) === c.key)), [records, constraints])
  const tot = useMemo(() => aggregate(recs, hoursById), [recs, hoursById])
  const usedDims = new Set(constraints.map((c) => c.dim))
  const title = constraints.length ? constraints.map((c) => c.key).join(' › ') : 'Overall'

  const tiles = [
    ['Revenue', gbp0(tot.gross)], ['Profit', gbp0(tot.profit)], ['Profit / unit', gbp(tot.units > 0 ? tot.profit / tot.units : 0)],
    ['Units', int(tot.units)], ['Streams', int(tot.streams)], ['Hours', tot.hours > 0 ? tot.hours.toFixed(1) : '—'],
    ['Rev / hour', tot.hours > 0 ? gbp0(tot.gross / tot.hours) : '—'], ['Margin', pct(tot.gross > 0 ? tot.profit / tot.gross : 0)],
  ]
  // breakdowns by every dimension not already pinned; product sorted by units
  const breakdowns = DIMENSIONS.filter((d) => !usedDims.has(d.id)).map((d) => {
    const rows = groupByDim(recs, d.id, hoursById)
    rows.sort((a, b) => d.id === 'product' ? (b.units - a.units) : (b.profit - a.profit))
    return { dim: d, rows }
  })

  const th = { textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 8px 5px' }
  const td = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--line)', textAlign: 'right' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', zIndex: 70, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, maxWidth: 720, width: '100%', padding: 20, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 4 }}>
          <div>
            <h3 className="h2" style={{ margin: 0, fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}>
              {constraints.length > 0 && <span style={{ width: 11, height: 11, borderRadius: '50%', background: dotColour(constraints[0].key), flex: '0 0 auto' }} />}
              {title}
            </h3>
            <div className="note" style={{ marginTop: 2 }}>{rangeLabel}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 4px' }}>
          {tiles.map(([l, v]) => (
            <div key={l} style={{ flex: '1 1 96px', minWidth: 90, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', fontWeight: 800 }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>

        {recs.length === 0 ? <p className="note">No sales for this selection in range.</p> : breakdowns.map(({ dim, rows }) => (
          <div key={dim.id} style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
              {dim.id === 'product' ? 'Most-used stock & profit by product' : `By ${dim.label.toLowerCase()}`}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 420 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>{dim.label}</th>
                  <th style={th}>Units</th><th style={th}>Revenue</th><th style={th}>Profit</th><th style={th}>Profit/unit</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 15).map((r) => (
                    <tr key={r.key}>
                      <td style={{ ...td, textAlign: 'left' }}>{r.key}</td>
                      <td style={td}>{int(r.units)}</td>
                      <td style={td}>{gbp0(r.gross)}</td>
                      <td style={{ ...td, color: r.profit >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp0(r.profit)}</td>
                      <td style={{ ...td, color: r.units > 0 && r.profit / r.units >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp(r.units > 0 ? r.profit / r.units : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 15 && <p className="note" style={{ marginBottom: 0 }}>Top 15 of {rows.length} — full detail in the CSV export.</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
