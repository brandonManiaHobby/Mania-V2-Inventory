import { useState, useMemo } from 'react'
import { computeStream, sumMoney } from '../money'
import { gbp0, gbp, pct, monthKey, parseLocalDate } from '../data'
import MoneyToggle, { VIEW_FIELD } from '../components/MoneyToggle'

// ============================================================
// INSIGHTS (Stage 5 — V1 parity + money layers)
// Monthly breakdowns by platform / channel / streamer / department, with
// the money toggle and CSV export. (Lead sees dept-scoped via scoping.)
// ============================================================
const DIMS = [{ k: 'platform', label: 'Platform' }, { k: 'channel', label: 'Channel' }, { k: 'streamer', label: 'Streamer' }]

export default function Insights({ scoped }) {
  const [dim, setDim] = useState('platform')
  const [view, setView] = useState('gross')
  const field = VIEW_FIELD[view]

  const data = useMemo(() => {
    const dimOf = (s) => dim === 'platform' ? (s.platform || '—') : dim === 'channel' ? (s.channel || '—') : (s.streamerName || '—')
    // month -> dim -> ladders
    const grid = {}
    const dims = new Set()
    for (const s of scoped.streams) {
      const m = monthKey(s.streamDate); if (!m) continue
      const d = dimOf(s); dims.add(d)
      const lines = scoped.streamLines.filter((l) => l.streamId === s.id && !l.brokered)
      const ladder = computeStream({ gross: s.totalSales, net: s.net, shipping: s.shipping },
        lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, lineTotal: l.lineTotal, brokered: false, stockItemId: l.stockItemId })),
        (sid) => scoped.stockItems.find((x) => x.id === sid)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard')
      grid[m] = grid[m] || {}; grid[m][d] = grid[m][d] || []; grid[m][d].push(ladder)
    }
    const months = Object.keys(grid).sort().reverse()
    const dimList = [...dims].sort()
    const rows = months.map((m) => {
      const cells = {}; let rowTotal = 0
      for (const d of dimList) { const t = grid[m][d] ? sumMoney(grid[m][d])[field.value] : 0; cells[d] = t; rowTotal += t }
      return { month: m, cells, total: rowTotal }
    })
    return { months, dimList, rows }
  }, [scoped, dim, field.value])

  const monthLabel = (m) => { const d = parseLocalDate(m + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : m }

  const downloadCsv = () => {
    const headers = ['Month', ...data.dimList, 'Total']
    const body = data.rows.map((r) => [monthLabel(r.month), ...data.dimList.map((d) => Math.round(r.cells[d])), Math.round(r.total)].join(','))
    const csv = [headers.join(','), ...body].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `insights-${dim}-${view}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const seg = (items, val, set) => (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
      {items.map((o) => <button key={o.k} onClick={() => set(o.k)} style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: val === o.k ? 700 : 400, background: val === o.k ? '#fff' : 'transparent' }}>{o.label}</button>)}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Insights</h2>
        <MoneyToggle view={view} onChange={setView} />
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0' }}>
        <span style={{ fontSize: 12, color: '#999' }}>By</span> {seg(DIMS, dim, setDim)}
        <button onClick={downloadCsv} disabled={!data.rows.length}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer', fontWeight: 600 }}>
          Download CSV
        </button>
      </div>

      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', overflowX: 'auto' }}>
        {data.rows.length === 0 ? <p style={{ color: '#888' }}>No data in scope.</p> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '6px 0' }}>Month</th>
              {data.dimList.map((d) => <th key={d}>{d}</th>)}
              <th>Total</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.month} style={{ borderTop: '1px solid #f3f3f3', textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '7px 0' }}>{monthLabel(r.month)}</td>
                  {data.dimList.map((d) => <td key={d}>{gbp0(r.cells[d])}</td>)}
                  <td style={{ fontWeight: 700 }}>{gbp0(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ color: '#aaa', fontSize: 12, marginTop: 10 }}>Figures in the selected money view ({LABEL[view]}).</p>
    </div>
  )
}
const LABEL = { gross: 'Gross', net: 'Net', netExVat: 'Net ex-VAT', trueProfit: 'Profit' }
