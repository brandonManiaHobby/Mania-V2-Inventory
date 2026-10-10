import { useState, useMemo } from 'react'
import { computeStream, computeMoney, sumMoney, exVat, vatOfInclusive } from '../money'
import { gbp0, todayKey, parseLocalDate, toDateKey, displayDate, vatTreatmentOf, hoursOf, shortName } from '../data'

// ============================================================
// EXPORT / REPORTS (V2 — the comprehensive, customisable export)
// An expansion on Insights, alongside the Topps survey. Pick ANY date range
// (not just a month) and toggle which sections to include, then preview on
// screen and download one multi-section CSV.
//
// Sections: Summary · Channels · Platforms · Stream type · Streamer
// performance · Distro sales · Products ran (units, total cost,
// realised profit) · Every stream (raw).
//
// Drift-proof: every money figure is computed through the money engine
// (computeStream / computeMoney / sumMoney, per-line VAT via the exVat /
// vatOfInclusive authorities). Distro sales run through the SAME engine with
// each product's VAT treatment (standard = VAT-included, second_hand =
// VAT-free), so Pokémon second-hand nuance is accounted for, not assumed.
// Full precision is kept through aggregation; rounding happens
// ONLY at the display/CSV edge. Reads the SCOPED source, so a lead's export
// is automatically limited to their department — same guarantee as everywhere.
// ============================================================

const SECTIONS = [
  { k: 'summary',   label: 'Summary' },
  { k: 'channels',  label: 'Channels' },
  { k: 'platforms', label: 'Platforms' },
  { k: 'types',     label: 'Stream type' },
  { k: 'streamers', label: 'Streamer performance' },
  { k: 'distro',    label: 'Distro sales' },
  { k: 'products',  label: 'Products ran' },
  { k: 'streams',   label: 'Every stream (raw)' },
]

// local date arithmetic — never toISOString (drift guarantee #1)
const addDays = (ymd, n) => { const d = parseLocalDate(ymd); d.setDate(d.getDate() + n); return toDateKey(d) }
const firstOfMonth = (ymd) => ymd.slice(0, 8) + '01'
const firstOfYear = (ymd) => ymd.slice(0, 5) + '01-01'

export default function Export({ scoped }) {
  const today = todayKey()
  const [from, setFrom] = useState(firstOfMonth(today))
  const [to, setTo] = useState(today)
  const [on, setOn] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.k, true])))

  const toggle = (k) => setOn((o) => ({ ...o, [k]: !o[k] }))
  const vatOf = (sid) => vatTreatmentOf(scoped, sid)

  // ---- the one computation everything derives from (engine + scope) ----
  const model = useMemo(() => {
    const inRange = scoped.streams
      .filter((s) => s.streamDate && s.streamDate >= from && s.streamDate <= to)
      .sort((a, b) => String(a.streamDate).localeCompare(String(b.streamDate)))

    // dimension buckets of engine ladders
    const bucket = () => ({})
    const byChannel = bucket(), byPlatform = bucket(), byType = bucket(), byStreamer = bucket()
    const streamerMeta = {}           // streamer -> { count, hours }
    const products = {}               // product -> { units, gross, costPaid, costExVat, profit }
    const streamRows = []             // raw rows
    const allLadders = []

    const push = (map, key, ladder) => { (map[key] = map[key] || []).push(ladder) }

    for (const s of inRange) {
      const liveLines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const gross = Number(s.totalSales) || 0
      const net = (s.net === null || s.net === undefined) ? gross : (Number(s.net) || 0)
      const engLines = liveLines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId }))
      const ladder = computeStream({ gross, net, shipping: s.shipping }, engLines, vatOf)
      allLadders.push(ladder)

      push(byChannel, s.channel || '—', ladder)
      push(byPlatform, s.platform || '—', ladder)
      push(byType, s.streamType || '—', ladder)
      const sName = s.streamerName || '—'
      push(byStreamer, sName, ladder)
      const meta = streamerMeta[sName] = streamerMeta[sName] || { count: 0, hours: 0 }
      meta.count += 1; meta.hours += hoursOf(s)

      // ---- per-line product attribution (identical formula to computeStream) ----
      const grossOfLines = liveLines.reduce((a, l) => a + (Number(l.lineTotal) || 0), 0) || gross || 1
      for (const l of liveLines) {
        const t = vatOf(l.stockItemId)
        const lineGross = Number(l.lineTotal) || 0
        const lineNetShare = grossOfLines > 0 ? (lineGross / grossOfLines) * net : 0
        const lineNetExVat = lineNetShare - vatOfInclusive(lineNetShare, t)
        const costPaid = (Number(l.qty) || 0) * (Number(l.unitCost) || 0)
        const costExVat = exVat(costPaid, t)
        const name = shortName(l.product || '—')
        const p = products[name] = products[name] || { units: 0, gross: 0, costPaid: 0, costExVat: 0, profit: 0 }
        p.units += Number(l.qty) || 0
        p.gross += lineGross
        p.costPaid += costPaid
        p.costExVat += costExVat
        p.profit += lineNetExVat - costExVat
      }

      streamRows.push({
        date: s.streamDate, title: s.title || '', streamer: sName,
        department: s.department || '', channel: s.channel || '', platform: s.platform || '',
        type: s.streamType || '', hours: hoursOf(s),
        gross: ladder.gross, net: ladder.net, vat: ladder.vatOwed, profit: ladder.trueProfit,
      })
    }

    // distro sales (stock sold through distribution, not broken on stream).
    // SAME money engine as everything else: each sale runs through computeMoney
    // with its product's VAT treatment. Distro has no platform fees, so net =
    // revenue; the engine then strips VAT for standard goods and passes it
    // through untouched for second-hand (the Pokémon nuance). Profit is net
    // ex-VAT − cost ex-VAT, like-for-like.
    const distro = {}
    for (const d of scoped.distroSales) {
      if (!d.soldOn || d.soldOn < from || d.soldOn > to) continue
      const t = vatOf(d.stockItemId)
      const revenue = Number(d.revenue) || 0
      const cost = Number(d.cost) || 0
      const m = computeMoney({ gross: revenue, net: revenue, costPaid: cost, vatTreatment: t })
      const name = shortName(d.product || '—')
      const g = distro[name] = distro[name] || { units: 0, revenue: 0, vat: 0, netExVat: 0, cost: 0, profit: 0, treatment: t }
      g.units += Number(d.qty) || 0
      g.revenue += revenue
      g.vat += m.vatOwed
      g.netExVat += m.netExVat
      g.cost += cost
      g.profit += m.trueProfit
      g.treatment = t
    }

    const dimRows = (map, metaMap) => Object.keys(map).sort().map((k) => {
      const t = sumMoney(map[k])
      return { name: k, count: map[k].length, hours: metaMap ? (metaMap[k]?.hours || 0) : null,
        gross: t.gross, net: t.net, vat: t.vatOwed, profit: t.trueProfit }
    })

    const total = sumMoney(allLadders)
    const totalHours = inRange.reduce((a, s) => a + hoursOf(s), 0)

    return {
      streamCount: inRange.length, totalHours, total,
      channels: dimRows(byChannel), platforms: dimRows(byPlatform), types: dimRows(byType),
      streamers: dimRows(byStreamer, streamerMeta),
      products: Object.keys(products).sort().map((k) => ({ name: k, ...products[k] })),
      distro: Object.keys(distro).sort().map((k) => ({ name: k, ...distro[k] })),
      distroTotal: Object.values(distro).reduce((a, g) => ({
        units: a.units + g.units, revenue: a.revenue + g.revenue, vat: a.vat + g.vat,
        cost: a.cost + g.cost, profit: a.profit + g.profit,
      }), { units: 0, revenue: 0, vat: 0, cost: 0, profit: 0 }),
      streamRows,
    }
  }, [scoped, from, to])

  // ---- preset ranges ----
  const presets = [
    { label: 'This month', run: () => { setFrom(firstOfMonth(today)); setTo(today) } },
    { label: 'Last month', run: () => { const lm = addDays(firstOfMonth(today), -1); setFrom(firstOfMonth(lm)); setTo(lm) } },
    { label: 'Last 30 days', run: () => { setFrom(addDays(today, -29)); setTo(today) } },
    { label: 'Last 90 days', run: () => { setFrom(addDays(today, -89)); setTo(today) } },
    { label: 'Year to date', run: () => { setFrom(firstOfYear(today)); setTo(today) } },
    { label: 'All time', run: () => {
      const dates = scoped.streams.map((s) => s.streamDate).filter(Boolean).sort()
      setFrom(dates[0] || firstOfYear(today)); setTo(today)
    } },
  ]

  // ---- CSV (only toggled sections) ----
  const downloadCsv = () => {
    const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const m = (n) => (Number(n) || 0).toFixed(2)
    const out = []
    out.push(q(`Mania — Export ${from} to ${to}`))
    out.push('')

    if (on.summary) {
      out.push('SUMMARY')
      out.push('Metric,Value')
      out.push(['Streams', model.streamCount].join(','))
      out.push(['Hours streamed', model.totalHours.toFixed(1)].join(','))
      out.push(['Gross', m(model.total.gross)].join(','))
      out.push(['Net', m(model.total.net)].join(','))
      out.push(['VAT owed', m(model.total.vatOwed)].join(','))
      out.push(['Realised profit', m(model.total.trueProfit)].join(','))
      out.push(['Distro revenue', m(model.distroTotal.revenue)].join(','))
      out.push(['Distro VAT', m(model.distroTotal.vat)].join(','))
      out.push(['Distro realised profit', m(model.distroTotal.profit)].join(','))
      out.push('')
    }
    const dimSection = (title, rows, withHours) => {
      out.push(title)
      out.push(['Name', 'Streams', ...(withHours ? ['Hours'] : []), 'Gross', 'Net', 'VAT', 'Profit'].join(','))
      rows.forEach((r) => out.push([q(r.name), r.count, ...(withHours ? [r.hours.toFixed(1)] : []), m(r.gross), m(r.net), m(r.vat), m(r.profit)].join(',')))
      out.push('')
    }
    if (on.channels) dimSection('BY CHANNEL', model.channels)
    if (on.platforms) dimSection('BY PLATFORM', model.platforms)
    if (on.types) dimSection('BY STREAM TYPE', model.types)
    if (on.streamers) dimSection('STREAMER PERFORMANCE', model.streamers, true)

    if (on.distro) {
      out.push('DISTRO SALES (sold through distribution)')
      out.push('Product,VAT treatment,Units,Revenue,VAT,Net ex-VAT,Cost,Realised profit')
      model.distro.forEach((r) => out.push([
        q(r.name), r.treatment === 'second_hand' ? '2nd-hand (VAT-free)' : 'VAT-included',
        r.units, m(r.revenue), m(r.vat), m(r.netExVat), m(r.cost), m(r.profit),
      ].join(',')))
      out.push('')
    }
    if (on.products) {
      out.push('PRODUCTS RAN (broken on stream)')
      out.push('Product,Units ran,Gross,Total cost (paid),Cost ex-VAT,Realised profit')
      model.products.forEach((r) => out.push([q(r.name), r.units, m(r.gross), m(r.costPaid), m(r.costExVat), m(r.profit)].join(',')))
      out.push('')
    }
    if (on.streams) {
      out.push('EVERY STREAM')
      out.push('Date,Title,Streamer,Department,Channel,Platform,Type,Hours,Gross,Net,VAT,Profit')
      model.streamRows.forEach((r) => out.push([
        q(r.date), q(r.title), q(r.streamer), q(r.department), q(r.channel), q(r.platform), q(r.type),
        r.hours.toFixed(1), m(r.gross), m(r.net), m(r.vat), m(r.profit),
      ].join(',')))
      out.push('')
    }

    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `mania-export-${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // ---- UI ----
  const field = { padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const card = { padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', marginBottom: 16, overflowX: 'auto' }
  const th = { textAlign: 'right', color: '#999', fontSize: 11, fontWeight: 700, padding: '0 0 6px' }
  const td = { textAlign: 'right', padding: '6px 0', fontSize: 13 }
  const anyRows = model.streamCount > 0 || model.distro.length > 0

  const DimTable = ({ title, rows, withHours, sub }) => (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{sub}</div>}
      {rows.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>Nothing in range.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Name</th>
            <th style={th}>Streams</th>{withHours && <th style={th}>Hours</th>}
            <th style={th}>Gross</th><th style={th}>Net</th><th style={th}>VAT</th><th style={th}>Profit</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid #f3f3f3' }}>
                <td style={{ ...td, textAlign: 'left' }}>{r.name}</td>
                <td style={td}>{r.count}</td>{withHours && <td style={td}>{r.hours.toFixed(1)}</td>}
                <td style={td}>{gbp0(r.gross)}</td><td style={td}>{gbp0(r.net)}</td>
                <td style={td}>{gbp0(r.vat)}</td><td style={{ ...td, fontWeight: 700 }}>{gbp0(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Export</h2>
        <button onClick={downloadCsv} disabled={!anyRows}
          style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: anyRows ? '#1a7f37' : '#ccc',
            color: '#fff', fontWeight: 700, cursor: anyRows ? 'pointer' : 'default' }}>
          Download CSV
        </button>
      </div>
      <p style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
        Pick a date range and the sections you want. Everything is computed live through the money engine, scoped to what you can see.
      </p>

      {/* Range + presets */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', margin: '10px 0 6px' }}>
        <label style={{ fontSize: 12, color: '#444' }}>From<br /><input type="date" style={{ ...field, marginTop: 4 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: 12, color: '#444' }}>To<br /><input type="date" style={{ ...field, marginTop: 4 }} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button key={p.label} onClick={p.run} style={{ ...field, cursor: 'pointer', background: '#faf9f7', fontSize: 12 }}>{p.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
        {displayDate(from)} → {displayDate(to)} · {model.streamCount} stream{model.streamCount === 1 ? '' : 's'} in range
      </div>

      {/* Section toggles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {SECTIONS.map((s) => (
          <button key={s.k} onClick={() => toggle(s.k)}
            style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid ' + (on[s.k] ? '#1a7f37' : '#ddd'),
              background: on[s.k] ? '#eafaf0' : '#fff', color: on[s.k] ? '#1a7f37' : '#888',
              fontWeight: on[s.k] ? 700 : 400, fontSize: 12, cursor: 'pointer' }}>
            {on[s.k] ? '✓ ' : ''}{s.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {on.summary && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Summary</div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {[
              ['Streams', model.streamCount], ['Hours', model.totalHours.toFixed(1)],
              ['Gross', gbp0(model.total.gross)], ['Net', gbp0(model.total.net)],
              ['VAT owed', gbp0(model.total.vatOwed)], ['Realised profit', gbp0(model.total.trueProfit)],
              ['Distro revenue', gbp0(model.distroTotal.revenue)], ['Distro profit', gbp0(model.distroTotal.profit)],
            ].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
        </div>
      )}

      {on.channels && <DimTable title="Channels" rows={model.channels} />}
      {on.platforms && <DimTable title="Platforms" rows={model.platforms} />}
      {on.types && <DimTable title="Stream type" rows={model.types} />}
      {on.streamers && <DimTable title="Streamer performance" rows={model.streamers} withHours sub="Hours from logged start/end times." />}

      {on.distro && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Distro sales</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Sold through distribution (not broken). VAT per product: VAT-included goods are stripped, second-hand pass through VAT-free.</div>
          {model.distro.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>No distro sales in range.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Product</th><th style={th}>Units</th>
                <th style={th}>Revenue</th><th style={th}>VAT</th><th style={th}>Cost</th><th style={th}>Realised profit</th>
              </tr></thead>
              <tbody>
                {model.distro.map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      {r.name}
                      <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                        background: r.treatment === 'second_hand' ? '#eef3ff' : '#f3f0e8',
                        color: r.treatment === 'second_hand' ? '#2a52be' : '#8a6d1a' }}>
                        {r.treatment === 'second_hand' ? '2nd-hand' : 'VAT'}
                      </span>
                    </td>
                    <td style={td}>{r.units}</td>
                    <td style={td}>{gbp0(r.revenue)}</td><td style={td}>{gbp0(r.vat)}</td>
                    <td style={td}>{gbp0(r.cost)}</td><td style={{ ...td, fontWeight: 700 }}>{gbp0(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {on.products && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Products ran</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Broken on stream — units, total cost and realised profit (VAT handled per product).</div>
          {model.products.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>No products ran in range.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Product</th><th style={th}>Units ran</th>
                <th style={th}>Gross</th><th style={th}>Total cost</th><th style={th}>Realised profit</th>
              </tr></thead>
              <tbody>
                {model.products.map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ ...td, textAlign: 'left' }}>{r.name}</td><td style={td}>{r.units}</td>
                    <td style={td}>{gbp0(r.gross)}</td><td style={td}>{gbp0(r.costPaid)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{gbp0(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {on.streams && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Every stream ({model.streamRows.length})</div>
          {model.streamRows.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>No streams in range.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th><th style={{ ...th, textAlign: 'left' }}>Streamer</th>
                <th style={{ ...th, textAlign: 'left' }}>Platform</th><th style={{ ...th, textAlign: 'left' }}>Type</th>
                <th style={th}>Gross</th><th style={th}>Net</th><th style={th}>Profit</th>
              </tr></thead>
              <tbody>
                {model.streamRows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ ...td, textAlign: 'left' }}>{r.date}</td><td style={{ ...td, textAlign: 'left' }}>{r.streamer}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{r.platform || '—'}</td><td style={{ ...td, textAlign: 'left' }}>{r.type || '—'}</td>
                    <td style={td}>{gbp0(r.gross)}</td><td style={td}>{gbp0(r.net)}</td><td style={{ ...td, fontWeight: 700 }}>{gbp0(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
