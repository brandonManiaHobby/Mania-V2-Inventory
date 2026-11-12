import { useState, useMemo } from 'react'
import { exVat, vatOfInclusive } from '../money'
import { gbp, gbp0, int, todayKey, displayDate, vatTreatmentOf, shortName, canonPlatform } from '../data'

// ============================================================
// STREAM PRODUCT LOGS (Reporting) — one row per product sold on a stream,
// for every streamer: unit price, revenue, cost/unit and profit/unit.
// Per-line profit uses the same net allocation as the rest of the app
// (each line's share of stream net = its gross share × net, VAT per product).
// Date range + streamer filter + search + CSV. Scoped like everything else.
// ============================================================
const firstOfYear = (ymd) => ymd.slice(0, 5) + '01-01'

export default function StreamLogs({ scoped }) {
  const today = todayKey()
  const [from, setFrom] = useState(firstOfYear(today))
  const [to, setTo] = useState(today)
  const [who, setWho] = useState('all')
  const [q, setQ] = useState('')

  const vatOf = (sid) => vatTreatmentOf(scoped, sid)

  const streamers = useMemo(() => [...new Map(scoped.streams.map((s) => [s.streamerId, s.streamerName])).entries()]
    .filter(([id]) => id).map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [scoped])

  const rows = useMemo(() => {
    const out = []
    for (const s of scoped.streams) {
      if (!s.streamDate || s.streamDate < from || s.streamDate > to) continue
      if (who !== 'all' && s.streamerId !== who) continue
      const allLive = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered && l.lineKind !== 'giveaway')
      if (allLive.length === 0) continue
      const grossOfLines = allLive.reduce((a, l) => a + (Number(l.lineTotal) || 0), 0) || Number(s.totalSales) || 1
      const net = (s.net === null || s.net === undefined) ? Number(s.totalSales) || 0 : Number(s.net) || 0
      for (const l of allLive) {
        const qty = Number(l.qty) || 0
        if (qty <= 0) continue
        const t = vatOf(l.stockItemId)
        const lineGross = Number(l.lineTotal) || 0
        const share = grossOfLines > 0 ? (lineGross / grossOfLines) * net : 0
        const netExVat = share - vatOfInclusive(share, t)
        const costPaid = qty * (Number(l.unitCost) || 0)
        const profit = netExVat - exVat(costPaid, t)
        out.push({
          id: l.id, date: s.streamDate, streamer: s.streamerName || '—', channel: s.channel || '',
          platform: canonPlatform(s.platform), product: shortName(l.product || '—'),
          qty, unitPrice: lineGross / qty, revenue: lineGross,
          costPerUnit: Number(l.unitCost) || 0, profit, profitPerUnit: profit / qty,
        })
      }
    }
    const filtered = q ? out.filter((r) => (r.product + ' ' + r.streamer + ' ' + r.channel).toLowerCase().includes(q.toLowerCase())) : out
    return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.streamer.localeCompare(b.streamer))
  }, [scoped, from, to, who, q])

  const totals = useMemo(() => rows.reduce((a, r) => ({ units: a.units + r.qty, revenue: a.revenue + r.revenue, profit: a.profit + r.profit }), { units: 0, revenue: 0, profit: 0 }), [rows])

  const downloadCsv = () => {
    const esc = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const m = (n) => (Number(n) || 0).toFixed(2)
    const out = [esc(`Mania — Stream product logs ${from} to ${to}`), '',
      'Date,Streamer,Channel,Platform,Product,Qty,Unit price,Revenue,Cost/unit,Profit/unit,Line profit']
    rows.forEach((r) => out.push([
      esc(r.date), esc(r.streamer), esc(r.channel), esc(r.platform), esc(r.product),
      r.qty, m(r.unitPrice), m(r.revenue), m(r.costPerUnit), m(r.profitPerUnit), m(r.profit),
    ].join(',')))
    out.push('', `TOTAL,,,,,${totals.units},,${m(totals.revenue)},,,${m(totals.profit)}`)
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `mania-stream-logs-${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const field = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const th = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '0 8px 6px' }
  const td = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--line)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="h2" style={{ margin: 0 }}>Stream product logs</h2>
        <button className="btn" onClick={downloadCsv} disabled={rows.length === 0}>Export CSV</button>
      </div>
      <p className="note">Every product sold on a stream — unit price, revenue and profit per unit — across all streamers.</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', margin: '10px 0' }}>
        <label style={{ fontSize: 12 }}>From<br /><input type="date" style={{ ...field, marginTop: 4 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>To<br /><input type="date" style={{ ...field, marginTop: 4 }} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Streamer<br />
          <select style={{ ...field, marginTop: 4 }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">All streamers</option>
            {streamers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, flex: 1, minWidth: 160 }}>Search<br /><input style={{ ...field, marginTop: 4, width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="product / streamer / channel" /></label>
      </div>

      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Lines</div><div className="value">{int(rows.length)}</div></div>
        <div className="stat"><div className="label">Units</div><div className="value">{int(totals.units)}</div></div>
        <div className="stat"><div className="label">Revenue</div><div className="value">{gbp0(totals.revenue)}</div></div>
        <div className="stat"><div className="label">Profit</div><div className="value pos">{gbp0(totals.profit)}</div></div>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        {rows.length === 0 ? <p className="note" style={{ marginTop: 0 }}>No product sales in range.</p> : (
          <table style={{ minWidth: 760 }}>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Streamer</th><th style={th}>Channel</th><th style={th}>Product</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Unit £</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th><th style={{ ...th, textAlign: 'right' }}>Cost/unit</th>
              <th style={{ ...th, textAlign: 'right' }}>Profit/unit</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 500).map((r) => (
                <tr key={r.id}>
                  <td style={td}>{displayDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td style={td}>{r.streamer}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{r.channel || '—'}</td>
                  <td style={td}>{r.product}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{int(r.qty)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{gbp(r.unitPrice)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{gbp(r.revenue)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{gbp(r.costPerUnit)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.profitPerUnit >= 0 ? 'var(--good)' : 'var(--red)' }}>{gbp(r.profitPerUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 500 && <p className="note">Showing first 500 of {int(rows.length)} rows on screen — the CSV export has them all.</p>}
      </div>
    </div>
  )
}
