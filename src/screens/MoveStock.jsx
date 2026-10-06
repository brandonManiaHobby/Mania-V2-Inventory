import { useState, useMemo } from 'react'
import { restock, returnToWarehouse, distroSale, availableQty, gbp, gbp0, int, useSource } from '../data'

// ============================================================
// MOVE STOCK (Stage 5) — hardened transfers: Restock, Return, Distro.
// PREVIEW-BEFORE-COMMIT on every move (before->after both sides). HARD
// BLOCK on moving more than available. Atomic via proven RPCs. Warehouse
// matched explicitly. This is the screen built so levels CAN'T drift.
// ============================================================
const OPS = [
  { k: 'restock', label: 'Restock', dir: 'Warehouse → Streamer' },
  { k: 'return', label: 'Return', dir: 'Streamer → Warehouse' },
  { k: 'distro', label: 'Distro sale', dir: 'Warehouse → Sold' },
]

export default function MoveStock({ scoped }) {
  const { refresh } = useSource()
  const [op, setOp] = useState('restock')
  const [stockItemId, setStockItemId] = useState('')
  const [who, setWho] = useState('')       // streamer (restock/return)
  const [waveNo, setWaveNo] = useState('') // distro
  const [qty, setQty] = useState('')
  const [revenue, setRevenue] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const items = scoped.stockItems.filter((s) => !s.archived)
  const streamers = scoped.profiles.filter((p) => ['breaker', 'channel_lead'].includes(p.role))
  const product = items.find((s) => s.id === stockItemId)
  const waves = scoped.waves.filter((w) => w.stockItemId === stockItemId).sort((a, b) => a.waveNo - b.waveNo)

  // current levels for the preview
  const warehouseQty = stockItemId ? availableQty(scoped, { stockItemId, holderId: 'warehouse' }) : 0
  const streamerQty = (stockItemId && who) ? availableQty(scoped, { stockItemId, holderId: who }) : 0
  const waveWarehouseQty = (stockItemId && waveNo !== '') ? availableQty(scoped, { stockItemId, holderId: 'warehouse', waveNo: Number(waveNo) }) : 0

  const n = Number(qty) || 0

  const buildPreview = () => {
    setErr(null); setMsg(null)
    try {
      if (!stockItemId) throw new Error('Pick a product')
      if (!(n > 0)) throw new Error('Enter a quantity')
      if (op === 'restock') {
        if (!who) throw new Error('Pick a streamer')
        if (n > warehouseQty) throw new Error(`Only ${warehouseQty} in the warehouse`)
        setPreview({ rows: [
          ['Warehouse', warehouseQty, warehouseQty - n],
          [nameOf(who), streamerQty, streamerQty + n],
        ] })
      } else if (op === 'return') {
        if (!who) throw new Error('Pick a streamer')
        if (n > streamerQty) throw new Error(`They only have ${streamerQty}`)
        setPreview({ rows: [
          [nameOf(who), streamerQty, streamerQty - n],
          ['Warehouse', warehouseQty, warehouseQty + n],
        ] })
      } else {
        if (waveNo === '') throw new Error('Pick a wave')
        if (n > waveWarehouseQty) throw new Error(`Only ${waveWarehouseQty} of wave ${waveNo} in warehouse`)
        setPreview({ rows: [
          [`Warehouse (wave ${waveNo})`, waveWarehouseQty, waveWarehouseQty - n],
          ['Sold (distro)', '—', `+${n} @ ${gbp(Number(revenue) || 0)}`],
        ], distro: true })
      }
    } catch (e) { setErr(e.message); setPreview(null) }
  }

  const commit = async () => {
    setBusy(true); setErr(null)
    try {
      if (op === 'restock') await restock(scoped, { stockItemId, toStreamerId: who, qty: n })
      else if (op === 'return') await returnToWarehouse(scoped, { stockItemId, fromStreamerId: who, qty: n })
      else await distroSale(scoped, { stockItemId, waveNo: Number(waveNo), qty: n, revenue: Number(revenue) || 0, note })
      setMsg('Move committed ✓')
      await refresh()
      setPreview(null); setQty(''); setRevenue(''); setNote('')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  function nameOf(id) { return scoped.profiles.find((p) => p.id === id)?.name || 'Streamer' }
  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const reset = () => { setPreview(null); setErr(null); setMsg(null) }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Move stock</h2>

      {/* Operation picker */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {OPS.map((o) => (
          <button key={o.k} onClick={() => { setOp(o.k); reset() }}
            style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
              border: '1px solid ' + (op === o.k ? '#7c5e00' : '#ddd'),
              background: op === o.k ? '#fde68a' : '#faf9f7', fontWeight: op === o.k ? 700 : 400 }}>
            {o.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>{OPS.find((o) => o.k === op).dir}</div>

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440 }}>
        <label style={lbl}>Product
          <select style={{ ...field, marginTop: 4 }} value={stockItemId} onChange={(e) => { setStockItemId(e.target.value); reset() }}>
            <option value="">Select…</option>
            {items.map((s) => <option key={s.id} value={s.id}>{s.product}</option>)}
          </select>
        </label>

        {op !== 'distro' && (
          <label style={lbl}>Streamer
            <select style={{ ...field, marginTop: 4 }} value={who} onChange={(e) => { setWho(e.target.value); reset() }}>
              <option value="">Select…</option>
              {streamers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        {op === 'distro' && (
          <>
            <label style={lbl}>Wave
              <select style={{ ...field, marginTop: 4 }} value={waveNo} onChange={(e) => { setWaveNo(e.target.value); reset() }}>
                <option value="">Select…</option>
                {waves.map((w) => <option key={w.id} value={w.waveNo}>Wave {w.waveNo} · {int(availableQty(scoped, { stockItemId, holderId: 'warehouse', waveNo: w.waveNo }))} in warehouse · {gbp(w.unitCost)}/unit</option>)}
              </select>
            </label>
            <label style={lbl}>Total revenue (£)
              <input style={{ ...field, marginTop: 4 }} type="number" value={revenue} onChange={(e) => { setRevenue(e.target.value); reset() }} />
            </label>
            <label style={lbl}>Note (optional)
              <input style={{ ...field, marginTop: 4 }} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        <label style={lbl}>Quantity
          <input style={{ ...field, marginTop: 4, maxWidth: 140 }} type="number" value={qty} onChange={(e) => { setQty(e.target.value); reset() }} />
        </label>

        {/* current levels hint */}
        {stockItemId && (
          <div style={{ fontSize: 12, color: '#888' }}>
            In warehouse: <strong>{int(warehouseQty)}</strong>
            {op !== 'distro' && who ? ` · ${nameOf(who)} has ${int(streamerQty)}` : ''}
          </div>
        )}
      </div>

      {err && <div style={{ color: '#c82828', marginTop: 12 }}>{err}</div>}
      {msg && <div style={{ color: '#1a7f37', fontWeight: 600, marginTop: 12 }}>{msg}</div>}

      {/* Preview before commit */}
      {!preview ? (
        <button onClick={buildPreview}
          style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, border: '1px solid #ddd', background: '#faf9f7', fontWeight: 600, cursor: 'pointer' }}>
          Preview move
        </button>
      ) : (
        <div style={{ marginTop: 16, padding: 16, border: '1px solid #d9820a', borderRadius: 12, background: 'rgba(253,224,138,0.15)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm this move</div>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: '#999', fontSize: 12, textAlign: 'right' }}>
              <th style={{ textAlign: 'left' }}>Holder</th><th>Before</th><th>After</th>
            </tr></thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0e8d0', textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '6px 0' }}>{r[0]}</td>
                  <td>{typeof r[1] === 'number' ? int(r[1]) : r[1]}</td>
                  <td style={{ fontWeight: 700 }}>{typeof r[2] === 'number' ? int(r[2]) : r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={commit} disabled={busy}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Committing…' : 'Confirm move'}
            </button>
            <button onClick={() => setPreview(null)} disabled={busy}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
const lbl = { fontSize: 13, color: '#444', display: 'block' }
