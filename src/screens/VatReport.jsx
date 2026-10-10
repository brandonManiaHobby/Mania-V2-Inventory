import { useState, useMemo } from 'react'
import { computeMoney, vatOfInclusive } from '../money'
import { gbp, gbp0, monthKey, parseLocalDate } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// VAT REPORT (Reporting) — for HMRC filing, not analysis.
// Output VAT (owed on standard sales) minus Input VAT (reclaimable on
// standard purchases) per period. Second-hand = VAT-free, excluded.
// All VAT from the money engine (inclusive VAT fraction).
// ============================================================
export default function VatReport({ scoped, embedded }) {
  const [period, setPeriod] = useState('month')

  // OUTPUT VAT: from sales (stream lines + distro) on STANDARD products.
  // INPUT VAT: from purchases (wave total_cost) on STANDARD products.
  const data = useMemo(() => {
    const out = {}  // period -> output vat
    const inp = {}  // period -> input vat

    const vatOf = (id) => scoped.stockItems.find((s) => s.id === id)?.vatTreatment === 'second_hand' ? 'second_hand' : 'standard'
    const bump = (map, key, v) => { if (key) map[key] = (map[key] || 0) + v }
    const pkey = (ymd) => period === 'month' ? monthKey(ymd) : (ymd || '').slice(0, period === 'day' ? 10 : 7)

    // Output VAT — stream line sales
    for (const l of scoped.streamLines) {
      if (l.brokered || vatOf(l.stockItemId) === 'second_hand') continue
      const stream = scoped.streams.find((s) => s.id === l.streamId)
      if (!stream) continue
      const m = computeMoney({ gross: l.lineTotal, net: l.lineTotal, vatTreatment: 'standard' })
      bump(out, pkey(stream.streamDate), m.vatOwed)
    }
    // Output VAT — distro
    for (const d of scoped.distroSales) {
      if (vatOf(d.stockItemId) === 'second_hand') continue
      const m = computeMoney({ gross: d.revenue, net: d.revenue, vatTreatment: 'standard' })
      bump(out, pkey(d.soldOn), m.vatOwed)
    }
    // Input VAT — purchases (waves), by wave created date
    for (const w of scoped.waves) {
      if (vatOf(w.stockItemId) === 'second_hand') continue
      const inputVat = vatOfInclusive(w.totalCost, 'standard') // inclusive VAT in the cost
      bump(inp, pkey(w.createdAt), inputVat)
    }

    const keys = [...new Set([...Object.keys(out), ...Object.keys(inp)])].sort().reverse()
    return keys.map((k) => ({ key: k, output: out[k] || 0, input: inp[k] || 0, net: (out[k] || 0) - (inp[k] || 0) }))
  }, [scoped, period])

  const totals = data.reduce((a, r) => ({ output: a.output + r.output, input: a.input + r.input, net: a.net + r.net }), { output: 0, input: 0, net: 0 })

  const label = (k) => {
    if (period === 'month') { const d = parseLocalDate(k + '-01'); return d ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : k }
    const d = parseLocalDate(period === 'day' ? k : k + '-01')
    return d ? d.toLocaleDateString('en-GB', period === 'day' ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' }) : k
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        {!embedded && <h2 style={{ margin: 0 }}>VAT report</h2>}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999 }}>
          {['month', 'day'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
                fontWeight: period === p ? 700 : 400, background: period === p ? '#fff' : 'transparent' }}>
              {p === 'month' ? 'Month' : 'Day'}
            </button>
          ))}
        </div>
      </div>

      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Output VAT (on standard sales) minus input VAT (reclaimable on standard purchases). Second-hand goods are VAT-free and excluded.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <StatCard label="Output VAT (owed)" value={gbp0(totals.output)} accent="#b8700a" />
        <StatCard label="Input VAT (reclaim)" value={gbp0(totals.input)} accent="#4a7fe0" />
        <StatCard label="Net VAT position" value={gbp0(totals.net)} accent={totals.net >= 0 ? '#c0392b' : '#1a7f37'}
          sub={totals.net >= 0 ? 'owed to HMRC' : 'reclaim from HMRC'} />
      </div>

      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', minWidth: 460 }}>
          <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '6px 0' }}>Period</th>
            <th>Output VAT</th><th>Input VAT</th><th>Net</th>
          </tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid #f3f3f3', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '7px 0' }}>{label(r.key)}</td>
                <td>{gbp(r.output)}</td>
                <td>{gbp(r.input)}</td>
                <td style={{ fontWeight: 700, color: r.net >= 0 ? '#c0392b' : '#1a7f37' }}>{gbp(r.net)}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: '#888' }}>No VAT activity in scope.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#aaa', fontSize: 12, marginTop: 10 }}>
        Not a substitute for your accountant's filing — a working view of your VAT position from recorded data.
      </p>
    </div>
  )
}
