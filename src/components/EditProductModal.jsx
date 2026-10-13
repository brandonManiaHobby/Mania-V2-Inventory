import { useState, useMemo, useEffect } from 'react'
import { gbp, gbp0, int, useSource, updateProduct, addStock, editWaveCost, deleteWave, waveImpactSummary } from '../data'

// ============================================================
// EDIT PRODUCT — product attributes + folded, hardened wave administration.
// Product: name / type / archive / Breakers price (admin+manager).
// Waves (admin only): add wave (reorder), edit wave, delete wave.
//
// The quantity/cost fold: total_cost is ALWAYS qty×unit_cost (enforced by the
// edit_wave_cost RPC), so they can't drift. A quantity change asks the basis:
//   • Correct the count  -> total cost fixed, £/unit recalculates
//   • Top up this batch  -> £/unit fixed, total cost grows (same price)
// A £/unit change shows an impact preview (past streams + profit swing) and
// lets you apply forward-only or restate past streams.
// ============================================================
export default function EditProductModal({ product, scoped, onClose }) {
  const { refresh } = useSource()
  const cap = scoped.cap || {}
  const isAdmin = !!cap.isAdmin
  const canProduct = !!cap.seesAllDepartments // admin or manager
  const waves = useMemo(() => scoped.waves.filter((w) => w.stockItemId === product.id).sort((a, b) => a.waveNo - b.waveNo), [scoped, product.id])

  // product fields
  const [name, setName] = useState(product.product || '')
  const [type, setType] = useState(product.type || '')
  const [archived, setArchived] = useState(!!product.archived)
  const [breakPrice, setBreakPrice] = useState(product.breakPrice != null ? String(product.breakPrice) : '')
  const [vatTreatment, setVatTreatment] = useState(product.vatTreatment === 'second_hand' ? 'second_hand' : 'standard')
  const [pBusy, setPBusy] = useState(false)
  const [pMsg, setPMsg] = useState(null)
  const [err, setErr] = useState(null)

  const saveProduct = async () => {
    setErr(null); setPMsg(null); setPBusy(true)
    try {
      await updateProduct({ id: product.id, product: name, type, archived, breakPrice, vatTreatment })
      setPMsg('Saved ✓'); await refresh()
    } catch (e) { setErr(e.message) } finally { setPBusy(false) }
  }

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 680, width: '100%', padding: 22, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Edit product</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {/* ---- product details ---- */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 200 }}>Name<br />
            <input style={{ ...field, marginTop: 4, width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} disabled={!canProduct} />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Type<br />
            <input style={{ ...field, marginTop: 4, width: 150 }} value={type} onChange={(e) => setType(e.target.value)} disabled={!canProduct} />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>Breakers price<br />
            <input style={{ ...field, marginTop: 4, width: 120 }} type="number" value={breakPrice} onChange={(e) => setBreakPrice(e.target.value)} disabled={!canProduct} placeholder="£/break" />
          </label>
          <label style={{ fontSize: 13, color: '#444' }}>VAT treatment<br />
            <select style={{ ...field, marginTop: 4, width: 190 }} value={vatTreatment} onChange={(e) => setVatTreatment(e.target.value)} disabled={!canProduct}>
              <option value="standard">Standard (VAT-included)</option>
              <option value="second_hand">Second-hand (VAT-free)</option>
            </select>
          </label>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          VAT is computed live, so changing this updates VAT owed across all of this product’s streams — history included.
        </div>
        <label style={{ fontSize: 13, color: '#444', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} disabled={!canProduct} /> Archived (hidden from pickers)
        </label>
        {canProduct && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={saveProduct} disabled={pBusy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: pBusy ? 0.6 : 1 }}>Save details</button>
            {pMsg && <span style={{ color: '#1a7f37', fontWeight: 600 }}>{pMsg}</span>}
          </div>
        )}

        {/* ---- waves ---- */}
        <div style={{ fontWeight: 800, margin: '20px 0 6px', borderTop: '1px solid #eee', paddingTop: 16 }}>Waves</div>
        {!isAdmin && <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Wave editing is admin-only. You can view the waves below.</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: '#999', fontSize: 11, textAlign: 'right' }}>
            <th style={{ textAlign: 'left' }}>Wave</th><th>Qty</th><th>£/unit</th><th>Total</th><th>Recovered</th><th></th>
          </tr></thead>
          <tbody>
            {waves.map((w) => (
              <WaveRow key={w.waveNo} w={w} product={product} isAdmin={isAdmin} onDone={refresh} setErr={setErr} />
            ))}
            {waves.length === 0 && <tr><td colSpan={6} style={{ color: '#999', padding: '8px 0' }}>No waves yet.</td></tr>}
          </tbody>
        </table>

        {/* add wave (reorder) */}
        {cap.canMoveStock && <AddWave productName={product.product} type={product.type} onDone={refresh} setErr={setErr} />}

        {err && <div style={{ color: '#c82828', marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  )
}

// ---- one wave row with an inline, hardened editor ----
function WaveRow({ w, product, isAdmin, onDone, setErr }) {
  const [open, setOpen] = useState(false)
  const [basis, setBasis] = useState('cost')   // 'cost' | 'count' | 'topup'
  const [unitCost, setUnitCost] = useState(String(w.unitCost ?? ''))
  const [newQty, setNewQty] = useState(String(w.qty ?? ''))   // for 'count'
  const [addQty, setAddQty] = useState('')                    // for 'topup'
  const [mode, setMode] = useState('forward')
  const [impact, setImpact] = useState(null)
  const [busy, setBusy] = useState(false)

  const oldTotal = Number(w.totalCost || 0)
  const oldUnit = Number(w.unitCost || 0)
  const oldQty = Number(w.qty || 0)

  // Resolve the (unit, qty) the RPC will receive from the chosen basis.
  const resolved = useMemo(() => {
    if (basis === 'cost') { const u = Number(unitCost) || 0; return { unit: u, qty: oldQty, total: u * oldQty } }
    if (basis === 'count') { const q = Number(newQty) || 0; const u = q > 0 ? oldTotal / q : 0; return { unit: u, qty: q, total: oldTotal } }
    const add = Number(addQty) || 0; const q = oldQty + add; return { unit: oldUnit, qty: q, total: q * oldUnit } // topup
  }, [basis, unitCost, newQty, addQty, oldTotal, oldUnit, oldQty])

  const unitChanged = Math.abs(resolved.unit - oldUnit) > 0.005

  // Preview impact whenever the per-unit cost changes.
  useEffect(() => {
    let live = true
    if (!unitChanged || !(resolved.unit >= 0)) { setImpact(null); return }
    waveImpactSummary(product.id, w.waveNo, resolved.unit)
      .then((s) => { if (live) setImpact(s) })
      .catch(() => { if (live) setImpact(null) })
    return () => { live = false }
  }, [unitChanged, resolved.unit, product.id, w.waveNo])

  const save = async () => {
    setErr(null); setBusy(true)
    try {
      await editWaveCost({ stockItemId: product.id, waveNo: w.waveNo, newUnitCost: resolved.unit, newQty: resolved.qty, mode: unitChanged ? mode : 'forward' })
      setOpen(false); await onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const del = async () => {
    if (!window.confirm(`Delete wave ${w.waveNo}? (Only possible if nothing has sold against it.)`)) return
    setErr(null); setBusy(true)
    try { await deleteWave({ stockItemId: product.id, waveNo: w.waveNo, unitCost: w.unitCost, totalCost: w.totalCost }); await onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const td = { padding: '6px 0', textAlign: 'right' }
  const basisBtn = (k, l) => (
    <button onClick={() => setBasis(k)} style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid ' + (basis === k ? '#1a7f37' : '#ddd'), background: basis === k ? '#eafaf0' : '#fff', color: basis === k ? '#1a7f37' : '#777', fontWeight: basis === k ? 700 : 400, cursor: 'pointer', fontSize: 12 }}>{l}</button>
  )
  const field = { padding: '6px 9px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit', width: 110 }

  return (
    <>
      <tr style={{ borderTop: '1px solid #f3f3f3' }}>
        <td style={{ textAlign: 'left' }}>W{w.waveNo}</td>
        <td style={td}>{int(w.qty)}</td>
        <td style={td}>{gbp(w.unitCost)}</td>
        <td style={td}>{gbp0(w.totalCost)}</td>
        <td style={td}>{gbp0(w.revenueRecovered)}{w.paidOff ? ' ✓' : ''}</td>
        <td style={{ ...td }}>
          {isAdmin && <button onClick={() => setOpen(!open)} style={{ border: 'none', background: 'none', color: '#2a52be', cursor: 'pointer', fontWeight: 600 }}>{open ? 'Close' : 'Edit'}</button>}
        </td>
      </tr>
      {open && isAdmin && (
        <tr><td colSpan={6} style={{ background: '#faf9f7', padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>What are you changing?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {basisBtn('cost', 'Fix the £/unit cost')}
            {basisBtn('count', 'Correct the count (total fixed)')}
            {basisBtn('topup', 'Top up this batch (same £/unit)')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            {basis === 'cost' && <label style={{ fontSize: 12 }}>New £/unit<br /><input style={{ ...field, marginTop: 3 }} type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></label>}
            {basis === 'count' && <label style={{ fontSize: 12 }}>New total qty<br /><input style={{ ...field, marginTop: 3 }} type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} /></label>}
            {basis === 'topup' && <label style={{ fontSize: 12 }}>Units to add<br /><input style={{ ...field, marginTop: 3 }} type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} /></label>}
          </div>

          {/* before -> after */}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
            <span>Qty: <strong>{int(oldQty)} → {int(resolved.qty)}</strong></span>
            <span>£/unit: <strong>{gbp(oldUnit)} → {gbp(resolved.unit)}</strong></span>
            <span>Total cost: <strong>{gbp0(oldTotal)} → {gbp0(resolved.total)}</strong></span>
          </div>

          {/* impact + mode, only when the per-unit cost moves */}
          {unitChanged && (
            <div style={{ marginTop: 10, padding: 10, border: '1px dashed #cbb', borderRadius: 8, background: '#fff' }}>
              <div style={{ fontSize: 12, color: '#b8700a', fontWeight: 700 }}>This changes the per-unit cost.</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                {impact ? `${int(impact.streams)} past stream${impact.streams === 1 ? '' : 's'} used this wave · profit swing ${gbp0(impact.total_swing)} if restated.` : 'Checking past-stream impact…'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {[['forward', 'Apply going forward only'], ['recompute', 'Also restate past streams']].map(([k, l]) => (
                  <button key={k} onClick={() => setMode(k)} style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid ' + (mode === k ? '#1a7f37' : '#ddd'), background: mode === k ? '#eafaf0' : '#fff', color: mode === k ? '#1a7f37' : '#777', fontWeight: mode === k ? 700 : 400, cursor: 'pointer', fontSize: 12 }}>{l}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={save} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Apply change'}</button>
            <button onClick={del} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0b4b4', background: '#fff', color: '#c82828', cursor: 'pointer' }}>Delete wave</button>
          </div>
        </td></tr>
      )}
    </>
  )
}

// ---- add a wave (reorder) to this product ----
function AddWave({ productName, type, onDone, setErr }) {
  const [open, setOpen] = useState(false)
  const [cost, setCost] = useState('')
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const field = { padding: '6px 9px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit', width: 110 }

  const save = async () => {
    setErr(null); setBusy(true)
    try { await addStock({ product: productName, type, cost: Number(cost), qty: Number(qty) }); setCost(''); setQty(''); setOpen(false); await onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: '1px dashed #bbb', background: '#faf9f7', cursor: 'pointer', fontWeight: 600 }}>+ Add wave (reorder)</button>
  return (
    <div style={{ marginTop: 10, padding: 12, border: '1px dashed #bbb', borderRadius: 8, background: '#faf9f7', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
      <label style={{ fontSize: 12 }}>Cost £/unit<br /><input style={{ ...field, marginTop: 3 }} type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
      <label style={{ fontSize: 12 }}>Quantity<br /><input style={{ ...field, marginTop: 3 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <button onClick={save} disabled={busy || !(Number(cost) >= 0 && Number(qty) > 0)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Add wave</button>
      <button onClick={() => setOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>Cancel</button>
      <div style={{ fontSize: 11, color: '#999', width: '100%' }}>A new £/unit starts a new wave; the same £/unit as an existing wave tops that one up.</div>
    </div>
  )
}
