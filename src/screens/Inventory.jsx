import { useState, useMemo } from 'react'
import { gbp, gbp0, int } from '../data'

// ============================================================
// INVENTORY (Stage 5) — warehouse + product stock summary.
// Per product: warehouse qty, with-streamers qty, total, stock value.
// Tap a product -> waves + who holds what. Derives from scoped holdings
// + waves + stock_items. Stock-level (no money toggle).
// ============================================================
export default function Inventory({ scoped }) {
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const byItem = {}
    for (const item of scoped.stockItems) {
      if (item.archived) continue
      byItem[item.id] = { id: item.id, product: item.product, vat: item.vatTreatment,
        warehouse: 0, withStreamers: 0, value: 0, waves: [], holders: [] }
    }
    for (const h of scoped.holdings) {
      const r = byItem[h.stockItemId]; if (!r || h.qty <= 0) continue
      if (h.isWarehouse) r.warehouse += h.qty
      else r.withStreamers += h.qty
      r.value += h.qty * h.unitCost
      r.holders.push(h)
    }
    for (const w of scoped.waves) {
      const r = byItem[w.stockItemId]; if (!r) continue
      r.waves.push(w)
    }
    return Object.values(byItem)
      .map((r) => ({ ...r, total: r.warehouse + r.withStreamers }))
      .filter((r) => r.total > 0 || r.waves.length > 0)
      .filter((r) => !q || r.product.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.value - a.value)
  }, [scoped, q])

  const totals = rows.reduce((a, r) => ({
    value: a.value + r.value, warehouse: a.warehouse + r.warehouse, withStreamers: a.withStreamers + r.withStreamers,
  }), { value: 0, warehouse: 0, withStreamers: 0 })

  const nameOf = (hid) => hid == null ? 'Warehouse' : (scoped.profiles.find((p) => p.id === hid)?.name || 'Streamer')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Inventory</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…"
          style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #ddd', font: 'inherit', width: 200 }} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
        <Stat label="Stock value" value={gbp0(totals.value)} />
        <Stat label="In warehouse" value={int(totals.warehouse)} />
        <Stat label="With streamers" value={int(totals.withStreamers)} />
        <Stat label="Products" value={int(rows.length)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => {
          const open = openId === r.id
          return (
            <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <button onClick={() => setOpenId(open ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>
                    {shortName(r.product)}
                    {r.vat === 'second_hand' && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#e6f0e6', color: '#1a7f37' }}>VAT-free</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {int(r.warehouse)} warehouse · {int(r.withStreamers)} with streamers
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{int(r.total)}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{gbp0(r.value)}</div>
                </div>
              </button>

              {open && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 14px', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Waves</div>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead><tr style={{ color: '#999', textAlign: 'right' }}>
                      <th style={{ textAlign: 'left' }}>Wave</th><th>Qty</th><th>Unit cost</th><th>Recovered</th><th></th>
                    </tr></thead>
                    <tbody>
                      {r.waves.sort((a, b) => a.waveNo - b.waveNo).map((w) => (
                        <tr key={w.id} style={{ borderTop: '1px solid #f5f5f5', textAlign: 'right' }}>
                          <td style={{ textAlign: 'left' }}>W{w.waveNo}</td>
                          <td>{int(w.qty)}</td>
                          <td>{gbp(w.unitCost)}</td>
                          <td>{gbp0(w.revenueRecovered)}</td>
                          <td>{w.paidOff ? <span style={{ color: '#1a7f37' }}>paid off</span> : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Who holds it</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {r.holders.filter((h) => h.qty > 0).map((h, i) => (
                      <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f4f1' }}>
                        {nameOf(h.holderId)}: {int(h.qty)} (W{h.waveNo})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ color: '#888' }}>No products match.</p>}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 110, padding: '14px 16px', border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}
function shortName(p) { return String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '') }
