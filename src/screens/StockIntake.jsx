import { useState, useMemo } from 'react'
import { gbp, gbp0, int, useSource, addStock, shortName } from '../data'
import StatCard from '../components/StatCard'

// ============================================================
// ADD STOCK (Stock) — bring inventory in. Reuses record_restock:
// a new product name creates the product; an existing one adds the stock as
// a wave — same £/unit tops up the matching wave, a new £/unit makes a new
// wave (a reorder). Actionable by admin / manager / warehouse (canMoveStock).
// ============================================================
export default function StockIntake({ scoped }) {
  const { refresh } = useSource()
  const [mode, setMode] = useState('existing')   // 'existing' | 'new'
  const [existingId, setExistingId] = useState('')
  const [newName, setNewName] = useState('')
  const [type, setType] = useState('')
  const [cost, setCost] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const items = useMemo(() => scoped.stockItems.filter((s) => !s.archived).sort((a, b) => a.product.localeCompare(b.product)), [scoped])
  const types = useMemo(() => [...new Set(scoped.stockItems.map((s) => s.type).filter(Boolean))].sort(), [scoped])
  const chosen = items.find((s) => s.id === existingId)
  const productName = mode === 'new' ? newName.trim() : (chosen?.product || '')

  // What will happen: new product, top-up of an existing wave, or a new wave?
  const outcome = useMemo(() => {
    const c = Number(cost)
    if (mode === 'new') return newName.trim() ? { kind: 'new-product', text: `Creates new product “${newName.trim()}”, wave 1.` } : null
    if (!chosen) return null
    if (!(c >= 0)) return null
    const waveAtCost = scoped.waves.find((w) => w.stockItemId === chosen.id && Number(w.unitCost) === c)
    return waveAtCost
      ? { kind: 'top-up', text: `Adds to existing wave ${waveAtCost.waveNo} (same £${c.toFixed(2)}/unit).` }
      : { kind: 'new-wave', text: `Creates a NEW wave for “${shortName(chosen.product)}” at £${(c || 0).toFixed(2)}/unit.` }
  }, [mode, newName, chosen, cost, scoped])

  const canSave = productName && Number(qty) > 0 && Number(cost) >= 0

  const save = async () => {
    setErr(null); setMsg(null)
    if (!canSave) return setErr('Pick a product, a cost and a quantity')
    setSaving(true)
    try {
      await addStock({ product: productName, type: mode === 'new' ? type : (chosen?.type || type), cost: Number(cost), qty: Number(qty) })
      setMsg(`Added ${int(Number(qty))} × ${shortName(productName)} ✓`)
      await refresh()
      setQty(''); setCost(''); if (mode === 'new') { setNewName(''); setType('') }
    } catch (e) { setErr(e.message || 'Could not add stock') } finally { setSaving(false) }
  }

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const totalCost = Number(cost) > 0 && Number(qty) > 0 ? Number(cost) * Number(qty) : 0

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Add stock</h2>
      <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
        Bring inventory into the warehouse. Same £/unit as an existing wave tops that wave up; a new £/unit starts a new wave (a reorder).
      </p>

      <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', marginTop: 8 }}>
        {/* existing vs new */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[['existing', 'Existing product'], ['new', 'New product']].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setErr(null); setMsg(null) }}
              style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid ' + (mode === k ? '#1a7f37' : '#ddd'),
                background: mode === k ? '#eafaf0' : '#fff', color: mode === k ? '#1a7f37' : '#777', fontWeight: mode === k ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          {mode === 'existing' ? (
            <label style={{ fontSize: 13, color: '#444' }}>Product<br />
              <select style={{ ...field, marginTop: 4, minWidth: 240 }} value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                <option value="">Select…</option>
                {items.map((s) => <option key={s.id} value={s.id}>{shortName(s.product)}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label style={{ fontSize: 13, color: '#444' }}>New product name<br />
                <input style={{ ...field, marginTop: 4, minWidth: 220 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Prismatic Evolutions ETB" />
              </label>
              <label style={{ fontSize: 13, color: '#444' }}>Type<br />
                <input style={{ ...field, marginTop: 4, width: 160 }} list="types" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Sealed" />
                <datalist id="types">{types.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
            </>
          )}
          <label style={{ fontSize: 13, color: '#444' }}>Cost £/unit<br />
            <input style={{ ...field, marginTop: 4, width: 110 }} type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Quantity<br />
            <input style={{ ...field, marginTop: 4, width: 100 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        </div>

        {outcome && (
          <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 8,
            background: outcome.kind === 'top-up' ? '#eafaf0' : '#eef3ff', color: outcome.kind === 'top-up' ? '#1a7f37' : '#2a52be' }}>
            {outcome.text}
          </div>
        )}

        {totalCost > 0 && (
          <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Units in" value={int(Number(qty))} />
            <StatCard label="Cost / unit" value={gbp(Number(cost))} />
            <StatCard label="Total cost" value={gbp0(totalCost)} accent="#111" />
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={!canSave || saving}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: canSave ? '#1a7f37' : '#ccc', color: '#fff', fontWeight: 700, cursor: canSave ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add to warehouse'}
          </button>
          {msg && <span style={{ color: '#1a7f37', fontWeight: 600 }}>{msg}</span>}
          {err && <span style={{ color: '#c82828' }}>{err}</span>}
        </div>
      </div>
    </div>
  )
}
