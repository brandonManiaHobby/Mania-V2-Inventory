import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { gbp, gbp0, int, useSource, updateProduct, addStock, setWarehouseQty, editWaveCost, deleteWave, waveImpactSummary } from '../data'

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
  // Units sitting in the warehouse (holder = null). This is what the quick
  // adjust/write-off bar corrects — set_warehouse_qty keeps the waves in sync.
  const warehouseQty = useMemo(() => (scoped.holdings || [])
    .filter((h) => h.stockItemId === product.id && h.isWarehouse)
    .reduce((a, h) => a + (Number(h.qty) || 0), 0), [scoped, product.id])
  const latestCost = waves.length ? waves[waves.length - 1].unitCost : (product.cost || 0)

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

  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto', animation: 'modal-fade 0.14s ease-out' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 680, width: '100%', margin: 'auto', padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', animation: 'modal-rise 0.16s ease-out' }}>
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

        {/* ---- prominent adjust / remove stock bar ---- */}
        {cap.canMoveStock && (
          <AdjustStock product={product} warehouseQty={warehouseQty} latestCost={latestCost} onDone={refresh} setErr={setErr} />
        )}

        {/* ---- waves ---- */}
        <div style={{ fontWeight: 800, margin: '20px 0 6px', borderTop: '1px solid #eee', paddingTop: 16 }}>Waves <span style={{ fontWeight: 400, fontSize: 12, color: '#999' }}>· cost layers (fix £/unit below)</span></div>
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
  ), document.body)
}

// ---- prominent adjust / remove / top-up bar (anyone who can move stock) ----
function AdjustStock({ product, warehouseQty, latestCost, onDone, setErr }) {
  const [tab, setTab] = useState('remove')   // 'remove' | 'set' | 'topup'
  const [n, setN] = useState('')             // remove: units off · set: exact qty
  const [addQty, setAddQty] = useState('')
  const [addCost, setAddCost] = useState(latestCost != null ? String(latestCost) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const removeN = Math.max(0, Number(n) || 0)
  const afterRemove = Math.max(0, warehouseQty - removeN)
  const setTo = Math.max(0, Number(n) || 0)

  const field = { padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit', width: 120 }
  const tabBtn = (k, l) => (
    <button onClick={() => { setTab(k); setN(''); setMsg(null) }} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid ' + (tab === k ? '#c0392b' : '#ddd'), background: tab === k ? '#fdecea' : '#fff', color: tab === k ? '#c0392b' : '#777', fontWeight: tab === k ? 700 : 500, cursor: 'pointer', fontSize: 13 }}>{l}</button>
  )

  const apply = async () => {
    setErr(null); setMsg(null); setBusy(true)
    try {
      if (tab === 'topup') {
        if (!(Number(addQty) > 0)) throw new Error('Enter how many units to add')
        await addStock({ product: product.product, type: product.type, cost: Number(addCost) || 0, qty: Number(addQty) })
      } else {
        const target = tab === 'remove' ? afterRemove : setTo
        if (tab === 'remove' && removeN <= 0) throw new Error('Enter how many units to remove')
        await setWarehouseQty({ product: product.product, type: product.type, cost: latestCost, qty: target })
      }
      setN(''); setAddQty(''); setMsg('Done ✓'); await onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 18, border: '1px solid #f0d9d4', background: '#fdf8f7', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Adjust / remove stock</div>
        <div style={{ fontSize: 13, color: '#555' }}>In warehouse: <strong>{int(warehouseQty)}</strong> units</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {tabBtn('remove', 'Remove / write off')}
        {tabBtn('set', 'Correct to exact qty')}
        {tabBtn('topup', 'Top up (add stock)')}
      </div>

      {tab === 'remove' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 12 }}>Units to remove<br /><input style={{ ...field, marginTop: 3 }} type="number" min="0" value={n} onChange={(e) => setN(e.target.value)} /></label>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 5, 10].map((q) => <button key={q} onClick={() => setN(String((Number(n) || 0) + q))} style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>+{q}</button>)}
          </div>
          <div style={{ fontSize: 13, color: '#555', alignSelf: 'center' }}>{int(warehouseQty)} → <strong>{int(afterRemove)}</strong></div>
        </div>
      )}
      {tab === 'set' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 12 }}>Exact warehouse qty<br /><input style={{ ...field, marginTop: 3 }} type="number" min="0" value={n} onChange={(e) => setN(e.target.value)} placeholder={String(int(warehouseQty))} /></label>
          <div style={{ fontSize: 13, color: '#555', alignSelf: 'center' }}>{int(warehouseQty)} → <strong>{int(setTo)}</strong></div>
        </div>
      )}
      {tab === 'topup' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 12 }}>Units to add<br /><input style={{ ...field, marginTop: 3 }} type="number" min="0" value={addQty} onChange={(e) => setAddQty(e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>£/unit<br /><input style={{ ...field, marginTop: 3, width: 100 }} type="number" step="0.01" value={addCost} onChange={(e) => setAddCost(e.target.value)} /></label>
          <div style={{ fontSize: 11, color: '#999', alignSelf: 'center', maxWidth: 200 }}>Same £/unit tops up the matching wave; a new £/unit starts a new wave.</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: tab === 'topup' ? '#1a7f37' : '#c0392b', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working…' : tab === 'topup' ? 'Add stock' : tab === 'remove' ? 'Remove units' : 'Set quantity'}
        </button>
        {msg && <span style={{ color: '#1a7f37', fontWeight: 600 }}>{msg}</span>}
        <span style={{ fontSize: 11, color: '#999' }}>Keeps cost in sync — removing units takes their cost off too.</span>
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
