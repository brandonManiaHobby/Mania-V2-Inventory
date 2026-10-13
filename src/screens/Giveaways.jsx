import { useState, useMemo } from 'react'
import { gbp, gbp0, int, todayKey, displayDate, parseLocalDate, toDateKey, shortName } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// GIVEAWAYS (Finance) — every giveaway logged through Record a stream
// (stream_lines where line_kind = 'giveaway'). Shows the stock written off:
// write-off cost = qty × the line's unit cost (what the stock cost us).
// Breakdowns by product and by streamer, a full list, and a CSV write-off
// export for the accounts. Date-range filter; scoped like everything else.
// ============================================================
const firstOfYear = (ymd) => ymd.slice(0, 5) + '01-01'

export default function Giveaways({ scoped, embedded }) {
  const today = todayKey()
  const [from, setFrom] = useState(() => {
    const dates = scoped.streams.map((s) => s.streamDate).filter(Boolean).sort()
    return dates[0] || firstOfYear(today)
  })
  const [to, setTo] = useState(today)

  const model = useMemo(() => {
    const streamById = Object.fromEntries(scoped.streams.map((s) => [s.id, s]))
    const rows = []
    for (const l of scoped.streamLines) {
      if (l.lineKind !== 'giveaway') continue
      const s = streamById[l.streamId]
      const date = s?.streamDate || null
      if (date && (date < from || date > to)) continue
      const qty = Number(l.qty) || 0
      const cost = qty * (Number(l.unitCost) || 0)
      rows.push({
        id: l.id, date, streamer: s?.streamerName || '—',
        product: shortName(l.product || '—'), productId: l.stockItemId,
        qty, unitCost: Number(l.unitCost) || 0, cost,
      })
    }
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    const totalCost = rows.reduce((a, r) => a + r.cost, 0)
    const totalUnits = rows.reduce((a, r) => a + r.qty, 0)

    const group = (keyFn) => {
      const m = {}
      for (const r of rows) { const k = keyFn(r); (m[k] = m[k] || { key: k, units: 0, cost: 0 }); m[k].units += r.qty; m[k].cost += r.cost }
      return Object.values(m).sort((a, b) => b.cost - a.cost)
    }
    return { rows, totalCost, totalUnits, byProduct: group((r) => r.product), byStreamer: group((r) => r.streamer) }
  }, [scoped, from, to])

  const downloadCsv = () => {
    const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const m = (n) => (Number(n) || 0).toFixed(2)
    const out = [q(`Mania — Giveaway write-off ${from} to ${to}`), '', 'Date,Streamer,Product,Qty,Unit cost,Write-off cost']
    model.rows.forEach((r) => out.push([q(r.date), q(r.streamer), q(r.product), r.qty, m(r.unitCost), m(r.cost)].join(',')))
    out.push('', `TOTAL,,,${model.totalUnits},,${m(model.totalCost)}`)
    const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `mania-giveaways-${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const field = { padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const th = { textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 700, padding: '0 8px 6px' }
  const td = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid #f3f3f3' }

  const MiniTable = ({ title, rows }) => (
    <div style={{ flex: '1 1 260px', minWidth: 240, padding: 14, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>None in range.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={{ ...th, textAlign: 'right' }}>Units</th><th style={{ ...th, textAlign: 'right' }}>Write-off</th></tr></thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={r.key}>
                <td style={{ ...td, textAlign: 'left' }}>{r.key}</td>
                <td style={{ ...td, textAlign: 'right' }}>{int(r.units)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{gbp0(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div>
      {!embedded && <h2 style={{ marginTop: 0 }}>Giveaways</h2>}
      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Every giveaway logged on a stream, and the stock it writes off (qty × unit cost). Export for the accounts below.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', margin: '10px 0' }}>
        <label style={{ fontSize: 12, color: '#444' }}>From<br /><input type="date" style={{ ...field, marginTop: 4 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: 12, color: '#444' }}>To<br /><input type="date" style={{ ...field, marginTop: 4 }} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={downloadCsv} disabled={model.rows.length === 0}
          style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: model.rows.length ? '#1a7f37' : '#ccc', color: '#fff', fontWeight: 700, cursor: model.rows.length ? 'pointer' : 'default' }}>
          Export write-off CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Stock written off" value={gbp0(model.totalCost)} accent="#c0392b" sub={`${int(model.totalUnits)} units given away`} />
        <StatCard label="Giveaway lines" value={int(model.rows.length)} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <MiniTable title="By product" rows={model.byProduct} />
        <MiniTable title="By streamer" rows={model.byStreamer} />
      </div>

      <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>All giveaways ({model.rows.length})</div>
        {model.rows.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>No giveaways logged in range.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>
                <th style={th}>Date</th><th style={th}>Streamer</th><th style={th}>Product</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Unit cost</th><th style={{ ...th, textAlign: 'right' }}>Write-off</th>
              </tr></thead>
              <tbody>
                {model.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{displayDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td style={td}>{r.streamer}</td>
                    <td style={td}>{r.product}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{int(r.qty)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{gbp(r.unitCost)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{gbp0(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
