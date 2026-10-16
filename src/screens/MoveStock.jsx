import { useState, useMemo } from 'react'
import { restock, returnToWarehouse, availableQty, int, gbp0, useSource } from '../data'
import SearchSelect from '../components/SearchSelect'

// ============================================================
// MOVE STOCK (Stage 5) — hardened transfers: Restock, Return.
// PREVIEW-BEFORE-COMMIT on every move (before->after both sides). HARD
// BLOCK on moving more than available. Atomic via proven RPCs. Warehouse
// matched explicitly. This is the screen built so levels CAN'T drift.
// (Distro sales live on their own screen now, with full B2B/invoice records.)
// ============================================================
const OPS = [
  { k: 'restock', label: 'Restock', dir: 'Warehouse → Streamer' },
  { k: 'return', label: 'Return', dir: 'Streamer → Warehouse' },
]

export default function MoveStock({ scoped }) {
  const { refresh } = useSource()
  const [op, setOp] = useState('restock')
  const [stockItemId, setStockItemId] = useState('')
  const [who, setWho] = useState('')       // streamer (restock/return)
  const [qty, setQty] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const items = scoped.stockItems.filter((s) => !s.archived)
  // Searchable options with live levels in the note (V1 Restock style).
  const productOptions = useMemo(() => items
    .map((s) => ({ id: s.id, label: s.product, note: `${s.type || 'Uncategorised'} · ${int(availableQty(scoped, { stockItemId: s.id, holderId: 'warehouse' }))} in warehouse` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [items, scoped])
  // Anyone who can hold a shelf can receive/return stock — streamers, leads,
  // and admins/managers who run breaks themselves (e.g. Brandon).
  const streamers = scoped.profiles
    .filter((p) => ['breaker', 'channel_lead', 'admin', 'manager'].includes(p.role))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // current levels for the preview
  const warehouseQty = stockItemId ? availableQty(scoped, { stockItemId, holderId: 'warehouse' }) : 0
  const streamerQty = (stockItemId && who) ? availableQty(scoped, { stockItemId, holderId: who }) : 0

  const n = Number(qty) || 0

  function nameOf(id) { return scoped.profiles.find((p) => p.id === id)?.name || 'Streamer' }
  const unitsOf = (id) => scoped.holdings.filter((h) => h.holderId === id && h.qty > 0).reduce((a, h) => a + h.qty, 0)
  const productsOf = (id) => new Set(scoped.holdings.filter((h) => h.holderId === id && h.qty > 0).map((h) => h.stockItemId)).size
  const chosenProduct = items.find((s) => s.id === stockItemId)?.product || ''
  const peopleOptions = useMemo(() => streamers.map((p) => ({ id: p.id, label: p.name + (p.id === scoped.cap?.userId ? ' (you)' : ''), note: `${int(unitsOf(p.id))} units on shelf` })), [streamers, scoped])

  const field = { padding: '9px 11px', borderRadius: 9, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)', width: '100%' }
  const stepLbl = { fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }
  const reset = () => { setErr(null); setMsg(null) }

  const doMove = async () => {
    setErr(null); setMsg(null)
    if (!who) return setErr(op === 'restock' ? 'Pick who you’re restocking' : 'Pick whose stock to return')
    if (!stockItemId) return setErr('Pick a product')
    if (!(n > 0)) return setErr('Enter a quantity')
    if (op === 'restock' && n > warehouseQty) return setErr(`Only ${warehouseQty} in the warehouse`)
    if (op === 'return' && n > streamerQty) return setErr(`They only have ${streamerQty}`)
    setBusy(true)
    try {
      if (op === 'restock') await restock(scoped, { stockItemId, toStreamerId: who, qty: n })
      else await returnToWarehouse(scoped, { stockItemId, fromStreamerId: who, qty: n })
      setMsg(op === 'restock' ? `Added ${n} to ${nameOf(who)}’s shelf ✓` : `Returned ${n} to the warehouse ✓`)
      await refresh(); setQty('')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Restock / Return sub-toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {OPS.map((o) => (
          <button key={o.k} className={'chip' + (op === o.k ? ' on' : '')} onClick={() => { setOp(o.k); reset() }}>{o.label}</button>
        ))}
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{op === 'restock' ? 'Restock' : 'Return'}</div>
        <div className="note" style={{ marginTop: 0, marginBottom: 16 }}>
          {op === 'restock' ? 'Moves stock from the warehouse onto someone’s shelf, ready to run on a stream.' : 'Moves stock from a shelf back into the warehouse.'}
        </div>

        {/* Step 1 — who */}
        <div style={stepLbl}>1. {op === 'restock' ? 'Who are you restocking?' : 'Whose stock are you returning?'}</div>
        <SearchSelect options={peopleOptions} value={who} onChange={(id) => { setWho(id); reset() }} placeholder="Search people…" emptyText="No people" />
        {who && (
          <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase' }}>{nameOf(who)} currently {op === 'restock' ? 'have' : 'hold'}</div>
            {stockItemId ? (
              <div style={{ marginTop: 4 }}><strong>{int(streamerQty)}</strong> × {chosenProduct}{streamerQty === 0 ? ' — none of this product yet' : ''}</div>
            ) : unitsOf(who) > 0 ? (
              <div style={{ marginTop: 4 }}><strong>{int(unitsOf(who))}</strong> units across {productsOf(who)} products</div>
            ) : (
              <div className="note" style={{ marginTop: 4 }}>Nothing on their shelf. This will be their first stock.</div>
            )}
          </div>
        )}

        {/* Step 2 — product */}
        <div style={{ ...stepLbl, marginTop: 18 }}>2. {op === 'restock' ? 'What are you adding?' : 'What are you returning?'}</div>
        <SearchSelect options={productOptions} value={stockItemId} onChange={(id) => { setStockItemId(id); reset() }} placeholder="Select a product…" emptyText="No stock matches" />
        {stockItemId && (
          <div className="note" style={{ marginTop: 6 }}>In warehouse: <strong>{int(warehouseQty)}</strong>{who ? ` · ${nameOf(who)} has ${int(streamerQty)}` : ''}</div>
        )}

        {/* Step 3 — qty */}
        <div style={{ ...stepLbl, marginTop: 18 }}>3. Quantity (units)</div>
        <input style={field} type="number" min="1" value={qty} onChange={(e) => { setQty(e.target.value); reset() }} placeholder="0" />

        {/* live before -> after */}
        {stockItemId && who && n > 0 && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            {op === 'restock'
              ? <>Warehouse <strong>{int(warehouseQty)} → {int(warehouseQty - n)}</strong> · {nameOf(who)} <strong>{int(streamerQty)} → {int(streamerQty + n)}</strong></>
              : <>{nameOf(who)} <strong>{int(streamerQty)} → {int(streamerQty - n)}</strong> · Warehouse <strong>{int(warehouseQty)} → {int(warehouseQty + n)}</strong></>}
          </div>
        )}

        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        {msg && <div className="ok" style={{ marginTop: 12 }}>{msg}</div>}

        <button className="btn" onClick={doMove} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? 'Working…' : op === 'restock' ? 'Add to shelf' : 'Return to warehouse'}
        </button>
      </div>
    </div>
  )
}
