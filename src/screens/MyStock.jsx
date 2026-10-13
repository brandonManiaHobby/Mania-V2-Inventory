import { useMemo, useState, useEffect, useCallback } from 'react'
import { gbp, int, isConsumable, requestConsumable, loadConsumableRequests } from '../data'

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

      <RequestConsumables scoped={scoped} uid={uid} />
    </div>
  )
}

// ---- streamer requests consumables (sleeves, top loaders, etc.) ----
function RequestConsumables({ scoped, uid }) {
  const consumables = useMemo(() => scoped.stockItems.filter((s) => !s.archived && isConsumable(s)).sort((a, b) => a.product.localeCompare(b.product)), [scoped])
  const [stockItemId, setStockItemId] = useState('')
  const [itemText, setItemText] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [mine, setMine] = useState([])

  const loadMine = useCallback(async () => {
    const { rows } = await loadConsumableRequests()
    setMine(rows.filter((r) => r.streamer_id === uid).slice(0, 6))
  }, [uid])
  useEffect(() => { loadMine() }, [loadMine])

  const submit = async () => {
    setErr(null); setMsg(null)
    if (!(Number(qty) > 0)) return setErr('Enter a quantity')
    if (!stockItemId && !itemText.trim()) return setErr('Pick a consumable or describe it')
    setBusy(true)
    try {
      await requestConsumable({ streamerId: uid, stockItemId: stockItemId || null, itemText: stockItemId ? null : itemText, qty: Number(qty), note })
      setMsg('Request sent ✓'); setStockItemId(''); setItemText(''); setQty(''); setNote(''); await loadMine()
    } catch (e) { setErr(e.message || 'Could not send') } finally { setBusy(false) }
  }

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const statusPill = (s) => <span className="pill" style={{ background: s === 'fulfilled' ? 'rgba(31,157,85,0.16)' : s === 'declined' ? 'rgba(228,0,43,0.12)' : 'rgba(255,106,0,0.14)', color: s === 'fulfilled' ? 'var(--good)' : s === 'declined' ? 'var(--red)' : 'var(--orange)' }}>{s}</span>

  return (
    <div className="panel">
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Request consumables</div>
      <div className="note" style={{ marginTop: 0, marginBottom: 10 }}>Sleeves, top loaders, team bags, labels, postage. Your request goes to the warehouse to fulfil.</div>
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div className="ok" style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        {consumables.length > 0 && (
          <label style={{ fontSize: 13 }}>Consumable<br />
            <select style={{ ...field, marginTop: 4, minWidth: 180 }} value={stockItemId} onChange={(e) => { setStockItemId(e.target.value); if (e.target.value) setItemText('') }}>
              <option value="">Select…</option>
              {consumables.map((s) => <option key={s.id} value={s.id}>{shortName(s.product)}</option>)}
            </select>
          </label>
        )}
        {!stockItemId && (
          <label style={{ fontSize: 13 }}>{consumables.length > 0 ? 'or describe it' : 'Item'}<br />
            <input style={{ ...field, marginTop: 4, minWidth: 160 }} value={itemText} onChange={(e) => setItemText(e.target.value)} placeholder="e.g. Penny sleeves" />
          </label>
        )}
        <label style={{ fontSize: 13 }}>Qty<br /><input style={{ ...field, marginTop: 4, width: 80 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label style={{ fontSize: 13, flex: 1, minWidth: 140 }}>Note<br /><input style={{ ...field, marginTop: 4, width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Request'}</button>
      </div>

      {mine.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="note" style={{ marginBottom: 4 }}>Your recent requests</div>
          {mine.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{int(r.qty)} × {r.stock_item_id ? shortName(scoped.stockItems.find((s) => s.id === r.stock_item_id)?.product || '—') : (r.item_text || '—')}</span>
              {statusPill(r.status)}
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
