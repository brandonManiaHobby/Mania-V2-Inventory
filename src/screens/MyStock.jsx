import { useMemo } from 'react'
import { gbp, int } from '../data'

// ============================================================
// MY STOCK (Stage 5) — the streamer's own shelf.
// Derives from scoped holdings (already filtered to the user by scoping).
// Groups by product, sums across waves, shows qty + value on hand.
// Stock-level screen — no money toggle (it's about what's where).
// ============================================================
export default function MyStock({ scoped }) {
  const uid = scoped.cap?.userId

  const rows = useMemo(() => {
    // Scoped holdings are already this user's (streamer) — but guard anyway.
    const mine = scoped.holdings.filter((h) => (uid ? h.holderId === uid : !h.isWarehouse) && h.qty > 0)
    const byProduct = {}
    for (const h of mine) {
      const item = scoped.stockItems.find((s) => s.id === h.stockItemId)
      const name = item?.product || '—'
      const r = byProduct[h.stockItemId] || (byProduct[h.stockItemId] = {
        id: h.stockItemId, product: name, qty: 0, value: 0, waves: [],
      })
      r.qty += h.qty
      r.value += h.qty * h.unitCost
      r.waves.push({ waveNo: h.waveNo, qty: h.qty, unitCost: h.unitCost })
    }
    return Object.values(byProduct).sort((a, b) => b.value - a.value)
  }, [scoped, uid])

  const totalQty = rows.reduce((a, r) => a + r.qty, 0)
  const totalValue = rows.reduce((a, r) => a + r.value, 0)

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>My Stock</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat label="Products on shelf" value={int(rows.length)} />
        <Stat label="Total units" value={int(totalQty)} />
        <Stat label="Stock value" value={gbp(totalValue)} />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>Nothing on your shelf right now.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              border: '1px solid #eee', borderRadius: 12, background: '#fff', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                <div style={{ fontWeight: 600 }}>{shortName(r.product)}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {r.waves.length > 1 ? `${r.waves.length} waves · ` : ''}{gbp(r.value / r.qty)}/unit avg
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{int(r.qty)}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{gbp(r.value)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 120, padding: '14px 16px', border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}
function shortName(p) { return String(p).replace(/^Pokemon TCG /, '').replace(/^Topps® /, '').replace(/^Topps /, '') }
