import { useState, useMemo } from 'react'
import { gbp0, gbp, monthKey, parseLocalDate, toDateKey } from '../data'

// ============================================================
// TOPPS SURVEY (Reporting) — monthly Fanatics/Topps EMEA breaker survey prep.
// Per Topps product: breaks, units, revenue, avg price, date range, channels.
// Auto-fills what the data knows; CSV export with blank FILL columns for the
// manual bits (street date, case size, break type). Carbon of the V1 tool.
// ============================================================
export default function ToppsSurvey({ scoped }) {
  const now = new Date()
  const [ym, setYm] = useState(monthKey(toDateKey(now)))

  const rows = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    const inMonth = (d) => d && d.slice(0, 7) === ym
    const byProduct = {}
    for (const l of scoped.streamLines) {
      if (l.brokered) continue
      const item = scoped.stockItems.find((s) => s.id === l.stockItemId)
      if (!item || !/^Topps/i.test(item.product)) continue
      const stream = scoped.streams.find((s) => s.id === l.streamId)
      if (!stream || !inMonth(stream.streamDate)) continue
      const r = byProduct[item.id] || (byProduct[item.id] = {
        id: item.id, product: item.product, streams: new Set(), units: 0, revenue: 0,
        first: null, last: null, channels: new Set(),
      })
      r.streams.add(stream.id)
      r.units += l.qty
      r.revenue += l.lineTotal
      if (stream.channel) r.channels.add(stream.channel)
      const sd = stream.streamDate
      if (!r.first || sd < r.first) r.first = sd
      if (!r.last || sd > r.last) r.last = sd
    }
    return Object.values(byProduct).map((r) => ({
      ...r, breaks: r.streams.size,
      avgPrice: r.units ? r.revenue / r.units : 0,
      channels: [...r.channels].join(', '),
    })).sort((a, b) => b.revenue - a.revenue)
  }, [scoped, ym])

  const monthLabel = (() => { const d = parseLocalDate(ym + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ym })()
  const changeMonth = (delta) => { const d = parseLocalDate(ym + '-01'); d.setMonth(d.getMonth() + delta); setYm(monthKey(toDateKey(d))) }

  const downloadCsv = () => {
    const headers = ['Product', 'Street date (FILL)', 'Case size (FILL)', 'Breaks', 'Units broken', 'Revenue', 'Avg price/unit', 'First break', 'Last break', 'Channels', 'Break type (FILL)']
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const body = rows.map((r) => [r.product, '', '', r.breaks, r.units, Math.round(r.revenue), r.avgPrice.toFixed(2), r.first, r.last, r.channels, ''].map(esc).join(','))
    const csv = [headers.join(','), ...body].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `topps-survey-${ym}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Topps survey</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => changeMonth(-1)} style={navBtn}>‹</button>
          <strong style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel}</strong>
          <button onClick={() => changeMonth(1)} style={navBtn}>›</button>
          <button onClick={downloadCsv} disabled={!rows.length}
            style={{ ...navBtn, background: '#1a7f37', color: '#fff', fontWeight: 700, padding: '6px 14px' }}>Download CSV</button>
        </div>
      </div>
      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Auto-filled from your breaking data. CSV has blank FILL columns for street date, case size, break type.
      </p>

      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '6px 0' }}>Product</th>
            <th>Breaks</th><th>Units</th><th>Revenue</th><th>Avg/unit</th><th style={{ textAlign: 'left' }}>Channels</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f3f3f3', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '7px 0' }}>{r.product}</td>
                <td>{r.breaks}</td><td>{r.units}</td><td>{gbp0(r.revenue)}</td><td>{gbp(r.avgPrice)}</td>
                <td style={{ textAlign: 'left', color: '#888' }}>{r.channels}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: '#888' }}>No Topps breaking activity in {monthLabel}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
const navBtn = { padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer', font: 'inherit' }
