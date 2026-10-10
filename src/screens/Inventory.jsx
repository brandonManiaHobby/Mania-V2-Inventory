import { useState, useMemo } from 'react'
import { gbp, gbp0, int } from '../data'
import WaveRows from '../components/WaveRows'

// ============================================================
// INVENTORY (Stage 5 — FULL V1 PARITY)
// Stock levels + valuation, warehouse/streamer split, waves + holders.
// PLUS: oversold alert (sold > received), profit/brokered flags, and an
// activity log of recent stock movements. Stock-level (no money toggle).
// ============================================================
const short = (p) => String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '')

export default function Inventory({ scoped }) {
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('stock') // stock | activity

  const data = useMemo(() => {
    const byItem = {}
    for (const item of scoped.stockItems) {
      if (item.archived) continue
      byItem[item.id] = { id: item.id, product: item.product, vat: item.vatTreatment, warehouse: 0, withStreamers: 0, value: 0, waves: [], holders: [], received: 0, sold: 0 }
    }
    for (const h of scoped.holdings) {
      const r = byItem[h.stockItemId]; if (!r || h.qty <= 0) continue
      if (h.isWarehouse) r.warehouse += h.qty; else r.withStreamers += h.qty
      r.value += h.qty * h.unitCost; r.holders.push(h)
    }
    for (const w of scoped.waves) { const r = byItem[w.stockItemId]; if (r) { r.waves.push(w); r.received += w.qty } }
    for (const l of scoped.streamLines) { if (l.brokered) continue; const r = byItem[l.stockItemId]; if (r) r.sold += l.qty }
    for (const d of scoped.distroSales) { const r = byItem[d.stockItemId]; if (r) r.sold += d.qty }

    const rows = Object.values(byItem).map((r) => ({ ...r, total: r.warehouse + r.withStreamers, oversoldBy: Math.max(0, r.sold - (r.received)) }))
    const oversold = rows.filter((r) => r.oversoldBy > 0).sort((a, b) => b.oversoldBy - a.oversoldBy)
    const visible = rows.filter((r) => r.total > 0 || r.waves.length > 0)
      .filter((r) => !q || r.product.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.value - a.value)
    return { rows: visible, oversold }
  }, [scoped, q])

  const totals = data.rows.reduce((a, r) => ({ value: a.value + r.value, warehouse: a.warehouse + r.warehouse, withStreamers: a.withStreamers + r.withStreamers }), { value: 0, warehouse: 0, withStreamers: 0 })
  const nameOf = (hid) => hid == null ? 'Warehouse' : (scoped.profiles.find((p) => p.id === hid)?.name || 'Streamer')

  // activity log from distro sales (most reliably dated movements we have in scope)
  const activity = useMemo(() => {
    const items = []
    for (const d of scoped.distroSales) {
      const item = scoped.stockItems.find((s) => s.id === d.stockItemId)
      items.push({ when: d.soldOn || (d.createdAt || '').slice(0, 10), type: 'Distro sale', product: item?.product || d.product, qty: d.qty, detail: gbp0(d.revenue), note: d.note })
    }
    return items.sort((a, b) => (b.when || '').localeCompare(a.when || '')).slice(0, 50)
  }, [scoped])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Inventory</h2>
        {tab === 'stock' && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…" style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #ddd', font: 'inherit', width: 200 }} />}
      </div>

      <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999, margin: '14px 0' }}>
        {[['stock', 'Stock'], ['activity', 'Activity log']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? '#fff' : 'transparent' }}>{l}</button>
        ))}
      </div>

      {tab === 'activity' ? (
        <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr style={{ color: '#999', fontSize: 12, textAlign: 'left' }}><th>Date</th><th>Type</th><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '6px 0' }}>{a.when}</td><td>{a.type}</td><td>{short(a.product)}</td>
                  <td style={{ textAlign: 'right' }}>{int(a.qty)}</td><td style={{ textAlign: 'right' }}>{a.detail}</td>
                </tr>
              ))}
              {activity.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#888' }}>No activity in scope.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* oversold alert */}
          {data.oversold.length > 0 && (
            <div style={{ marginBottom: 12, padding: '10px 14px', border: '1px solid #c82828', borderRadius: 10, background: 'rgba(200,40,40,0.05)' }}>
              <div style={{ fontWeight: 700, color: '#c82828', marginBottom: 4 }}>⚠ {data.oversold.length} product{data.oversold.length > 1 ? 's' : ''} sold more than received</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.oversold.slice(0, 10).map((o) => (
                  <span key={o.id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fff', border: '1px solid #f0c0c0' }}>{short(o.product)} <strong style={{ color: '#c82828' }}>+{int(o.oversoldBy)}</strong></span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat label="Stock value" value={gbp0(totals.value)} />
            <Stat label="In warehouse" value={int(totals.warehouse)} />
            <Stat label="With streamers" value={int(totals.withStreamers)} />
            <Stat label="Products" value={int(data.rows.length)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.rows.map((r) => {
              const open = openId === r.id
              const loss = r.waves.some((w) => w.totalCost > 0 && w.revenueRecovered > 0 && w.revenueRecovered < w.totalCost && w.paidOff === false)
              return (
                <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                  <button onClick={() => setOpenId(open ? null : r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                      <div style={{ fontWeight: 600 }}>
                        {short(r.product)}
                        {r.vat === 'second_hand' && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#e6f0e6', color: '#1a7f37' }}>VAT-free</span>}
                        {r.oversoldBy > 0 && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fde0e0', color: '#c82828' }}>oversold</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#999' }}>{int(r.warehouse)} warehouse · {int(r.withStreamers)} with streamers</div>
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
                        <thead><tr style={{ color: '#999', textAlign: 'right' }}><th style={{ textAlign: 'left' }}>Wave</th><th>Qty</th><th>Unit cost</th><th>Recovered</th><th></th></tr></thead>
                        <tbody>
                          <WaveRows waves={r.waves} productName={r.product} />
                        </tbody>
                      </table>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Who holds it</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {r.holders.filter((h) => h.qty > 0).map((h, i) => (
                          <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: '#f5f4f1' }}>{nameOf(h.holderId)}: {int(h.qty)} (W{h.waveNo})</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {data.rows.length === 0 && <p style={{ color: '#888' }}>No products match.</p>}
          </div>
        </>
      )}
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
