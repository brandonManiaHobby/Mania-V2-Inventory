import { useMemo } from 'react'
import { gbp0, gbp, pct } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// STOCK P&L (Reporting) — overall stock profit/loss across all products.
// Total invested (wave cost) vs recovered (sales) vs remaining stock value,
// with realised + unrealised position. One roll-up of the whole inventory.
// ============================================================
export default function StockPnL({ scoped }) {
  const rows = useMemo(() => {
    const byItem = {}
    for (const w of scoped.waves) {
      const item = scoped.stockItems.find((s) => s.id === w.stockItemId)
      if (!item) continue
      const r = byItem[w.stockItemId] || (byItem[w.stockItemId] = { id: w.stockItemId, product: item.product, invested: 0, recovered: 0, onHandValue: 0 })
      r.invested += w.totalCost
      r.recovered += w.revenueRecovered
    }
    for (const h of scoped.holdings) {
      const r = byItem[h.stockItemId]; if (!r || h.qty <= 0) continue
      r.onHandValue += h.qty * h.unitCost
    }
    return Object.values(byItem)
      .map((r) => ({ ...r, realised: r.recovered - (r.invested - r.onHandValue), position: r.recovered + r.onHandValue - r.invested }))
      .filter((r) => r.invested > 0)
      .sort((a, b) => b.invested - a.invested)
  }, [scoped])

  const t = rows.reduce((a, r) => ({
    invested: a.invested + r.invested, recovered: a.recovered + r.recovered,
    onHandValue: a.onHandValue + r.onHandValue, position: a.position + r.position,
  }), { invested: 0, recovered: 0, onHandValue: 0, position: 0 })

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Stock P&L</h2>
      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Overall position: what you invested in stock vs what's been recovered in sales plus what's still on hand.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <StatCard label="Invested (stock cost)" value={gbp0(t.invested)} />
        <StatCard label="Recovered (sales)" value={gbp0(t.recovered)} accent="#1a7f37" />
        <StatCard label="Stock still on hand" value={gbp0(t.onHandValue)} accent="#4a7fe0" />
        <StatCard label="Overall position" value={gbp0(t.position)} accent={t.position >= 0 ? '#1a7f37' : '#c0392b'}
          sub={t.position >= 0 ? 'in profit (incl. stock on hand)' : 'down (incl. stock on hand)'} />
      </div>

      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', minWidth: 540 }}>
          <thead><tr style={{ textAlign: 'right', color: '#999', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '6px 0' }}>Product</th>
            <th>Invested</th><th>Recovered</th><th>On hand</th><th>Position</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f3f3f3', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '7px 0' }}>{shortName(r.product)}</td>
                <td>{gbp0(r.invested)}</td>
                <td>{gbp0(r.recovered)}</td>
                <td>{gbp0(r.onHandValue)}</td>
                <td style={{ fontWeight: 700, color: r.position >= 0 ? '#1a7f37' : '#c0392b' }}>{gbp0(r.position)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#888' }}>No stock in scope.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function shortName(p) { return String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '') }
