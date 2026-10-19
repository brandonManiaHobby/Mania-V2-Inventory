import { useState, useMemo } from 'react'
import { gbp, gbp0, int, useSource, addStock, shortName } from '../data'
import { supabase } from '../supabaseClient'
import StatCard from '../components/StatCard'
import SearchSelect from '../components/SearchSelect'

// ============================================================
// ADD STOCK (Warehouse) — V1 parity. One typed Product box that either picks an
// existing product or creates a new one; same £/unit tops up the matching wave,
// a new £/unit starts a new wave (a reorder). Plus Bulk import / export (CSV)
// and an out-of-stock table. Reuses record_restock. (admin / manager / warehouse)
// ============================================================
export default function StockIntake({ scoped }) {
  const { refresh } = useSource()
  const [productId, setProductId] = useState('')   // chosen existing product
  const [newName, setNewName] = useState('')        // typed-in new product
  const [type, setType] = useState('')              // category (for a new product)
  const [cost, setCost] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const items = useMemo(() => scoped.stockItems.filter((s) => !s.archived).sort((a, b) => a.product.localeCompare(b.product)), [scoped])
  const types = useMemo(() => [...new Set(scoped.stockItems.map((s) => s.type).filter(Boolean))].sort(), [scoped])

  // Cost per unit = latest wave cost, so the export/catalogue reads like V1's.
  const costOf = (id) => {
    const ws = scoped.waves.filter((w) => w.stockItemId === id).sort((a, b) => b.waveNo - a.waveNo)
    return ws[0]?.unitCost || 0
  }
  const catalogue = useMemo(() => items.map((s) => {
    const warehouse = scoped.holdings.filter((h) => h.stockItemId === s.id && h.isWarehouse).reduce((a, h) => a + h.qty, 0)
    return { id: s.id, product: s.product, type: s.type || '', warehouse_qty: warehouse, cost: costOf(s.id) }
  }), [items, scoped])

  // Known products with nothing on hand anywhere (warehouse or shelves).
  const outOfStock = useMemo(() => {
    const onHand = {}
    for (const h of scoped.holdings) { if (h.qty > 0) onHand[h.stockItemId] = (onHand[h.stockItemId] || 0) + h.qty }
    return items.filter((s) => !(onHand[s.id] > 0)).map((s) => ({ ...s, cost: costOf(s.id) })).sort((a, b) => a.product.localeCompare(b.product))
  }, [items, scoped])

  const chosen = items.find((s) => s.id === productId)
  const mode = newName ? 'new' : 'existing'
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

  const pickExisting = (id) => { setProductId(id); setNewName(''); setType(''); setErr(null); setMsg(null) }
  const createNew = (name) => { setNewName(name); setProductId(''); setErr(null); setMsg(null) }
  const clearProduct = () => { setProductId(''); setNewName(''); setType('') }

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

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  const totalCost = Number(cost) > 0 && Number(qty) > 0 ? Number(cost) * Number(qty) : 0

  return (
    <div style={{ maxWidth: 760 }}>
      {bulkOpen && <BulkStockModal catalogue={catalogue} onClose={() => setBulkOpen(false)} onDone={refresh} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Warehouse</h2>
        <button className="btn ghost sm" onClick={() => setBulkOpen(true)}>Bulk import / export</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
        Type to pick an existing product to top up, or add a brand-new one. Same £/unit as an existing wave tops that wave up; a new £/unit starts a new wave (a reorder).
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
        Count in the unit you sell it in: <strong>TCG in packs</strong> (2 booster boxes of 36 = 72), <strong>everything else in boxes</strong>. Cost is per unit — never a case or invoice total.
      </p>

      <div className="panel" style={{ marginTop: 8 }}>
        <div className="field">
          <label>Product</label>
          {mode === 'new' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--orange)', borderRadius: 8, background: 'rgba(255,106,0,0.07)' }}>
              <span style={{ flex: 1 }}><strong>{newName}</strong> <span className="note">· new product</span></span>
              <button onClick={clearProduct} style={{ ...field, cursor: 'pointer', padding: '2px 10px', background: 'transparent', color: 'var(--muted)' }}>×</button>
            </div>
          ) : (
            <SearchSelect
              options={items.map((s) => ({ id: s.id, label: shortName(s.product), note: s.type || '' }))}
              value={productId} onChange={pickExisting}
              onCreate={createNew} createLabel="Add new product"
              placeholder="Search products, or type a new name…" emptyText="No products" />
          )}
        </div>

        <div className="row2">
          {mode === 'new' && (
            <div className="field">
              <label>Category</label>
              <input style={field} list="stk-types" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. TCG, Baseball, Soccer" />
              <datalist id="stk-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          )}
          {mode === 'existing' && chosen && (
            <div className="field">
              <label>Category</label>
              <div style={{ ...field, color: 'var(--muted)' }}>{chosen.type || 'Uncategorised'}</div>
            </div>
          )}
          <div className="field">
            <label>Cost £/unit</label>
            <input style={field} type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="field">
            <label>Quantity</label>
            <input style={field} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>

        {outcome && (
          <div style={{ marginTop: 2, marginBottom: 12, fontSize: 13, padding: '8px 12px', borderRadius: 8,
            background: outcome.kind === 'top-up' ? 'rgba(31,157,85,0.10)' : 'rgba(58,111,216,0.10)', color: outcome.kind === 'top-up' ? 'var(--good)' : '#2a52be' }}>
            {outcome.text}
          </div>
        )}

        {totalCost > 0 && (
          <div style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Units in" value={int(Number(qty))} />
            <StatCard label="Cost / unit" value={gbp(Number(cost))} />
            <StatCard label="Total cost" value={gbp0(totalCost)} accent="#111" />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" onClick={save} disabled={!canSave || saving}>{saving ? 'Adding…' : 'Add new wave'}</button>
          {msg && <span style={{ color: 'var(--good)', fontWeight: 600 }}>{msg}</span>}
          {err && <span style={{ color: 'var(--red)' }}>{err}</span>}
        </div>
      </div>

      {/* Out of stock — known products with nothing on hand; click to top up */}
      {outOfStock.length > 0 && (
        <div className="panel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 800 }}>Out of stock ({outOfStock.length})</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Known products with nothing on hand. Click one to top it back up.</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 420 }}>
              <thead><tr>
                <th style={th}>Product</th><th style={th}>Category</th><th style={{ ...th, textAlign: 'right' }}>Cost / unit</th>
              </tr></thead>
              <tbody>
                {outOfStock.map((s) => (
                  <tr key={s.id} onClick={() => pickExisting(s.id)} style={{ cursor: 'pointer', background: productId === s.id ? 'rgba(255,106,0,0.08)' : 'transparent' }}>
                    <td style={td}>{shortName(s.product)}</td>
                    <td style={td}><span className="pill">{s.type || 'Uncategorised'}</span></td>
                    <td style={{ ...td, textAlign: 'right' }}>{gbp(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '8px 14px' }
const td = { padding: '8px 14px', fontSize: 13, borderTop: '1px solid var(--line)' }

// ---- CSV parser that copes with quoted fields (V1 parity) ----
function parseCSV(text) {
  const rows = []
  let field = '', row = [], inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => (x || '').trim() !== ''))
}
const num = (s) => Number(String(s ?? '').replace(/[£,\s]/g, ''))

// ---- Bulk import / export modal (V1 parity) ----
function BulkStockModal({ catalogue, onClose, onDone }) {
  const [preview, setPreview] = useState(null) // { rows, errors }
  const [mode, setMode] = useState('add')        // 'add' = delivery landed | 'set' = stocktake
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  function handleFile(e) {
    setResult(null); setPreview(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const grid = parseCSV(String(reader.result))
      if (grid.length < 2) { setPreview({ rows: [], errors: ['File looks empty or has no data rows.'] }); return }
      const header = grid[0].map((h) => h.trim().toLowerCase())
      const idxTitle = header.findIndex((h) => ['title', 'product', 'name'].includes(h))
      const idxQty = header.findIndex((h) => (h.includes('qty') || h.includes('quantity') || h.includes('box') || h.includes('unit')) && !h.includes('cost'))
      const idxCost = header.findIndex((h) => h.includes('cost') || h === 'price')
      const idxCat = header.findIndex((h) => ['category', 'type'].includes(h))
      const errors = []
      if (idxTitle < 0) errors.push('Missing a Title column.')
      if (idxQty < 0) errors.push('Missing a Quantity column.')
      if (idxCost < 0) errors.push('Missing a Unit cost column.')
      if (errors.length) { setPreview({ rows: [], errors }); return }
      const knownCats = new Set(catalogue.map((c) => (c.type || '').trim().toLowerCase()).filter(Boolean))
      const rows = []
      grid.slice(1).forEach((r, i) => {
        const title = (r[idxTitle] || '').trim()
        const qty = parseInt(num(r[idxQty]), 10)
        const cst = num(r[idxCost])
        const category = idxCat >= 0 ? (r[idxCat] || '').trim() : ''
        if (!title) { errors.push(`Row ${i + 2}: no title.`); return }
        if (!Number.isFinite(qty) || qty <= 0) { errors.push(`Row ${i + 2} (${title}): quantity must be a positive whole number.`); return }
        if (!Number.isFinite(cst)) { errors.push(`Row ${i + 2} (${title}): cost isn't a number.`); return }
        const existing = catalogue.find((c) => c.product.trim().toLowerCase() === title.toLowerCase())
        const newCategory = !!category && !knownCats.has(category.toLowerCase())
        rows.push({ title, qty, cost: cst, category, isNew: !existing, newCategory })
      })
      setPreview({ rows, errors })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function runImport() {
    if (!preview?.rows.length) return
    setBusy(true); setResult(null)
    let ok = 0; const failed = []
    for (const row of preview.rows) {
      const fn = mode === 'set' ? 'set_warehouse_qty' : 'record_restock'
      const { error } = await supabase.rpc(fn, { p_product: row.title, p_type: row.category || 'Uncategorised', p_cost: row.cost, p_qty: row.qty })
      if (error) failed.push(`${row.title}: ${error.message}`); else ok++
    }
    setBusy(false); setPreview(null); setResult({ ok, failed }); onDone?.()
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
  }
  function exportStock() {
    const q = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)
    const lines = ['Title,Category,Quantity (units),Cost per unit']
    catalogue.forEach((c) => lines.push(`${q(c.product)},${q(c.type || '')},${c.warehouse_qty},${Number(c.cost).toFixed(2)}`))
    download('mania-stock-snapshot.csv', lines.join('\n'))
  }

  const newCount = preview?.rows.filter((r) => r.isNew).length || 0
  const topupCount = preview?.rows.filter((r) => !r.isNew).length || 0
  const btn = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer', font: 'inherit', fontSize: 13 }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto', animation: 'modal-fade 0.14s ease-out' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 680, margin: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', animation: 'modal-rise 0.16s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Bulk import / export (CSV)</div>
          <button onClick={onClose} style={btn}>Close</button>
        </div>
        <p className="note" style={{ marginTop: 0 }}>Columns: <strong>Title, Category, Quantity (units), Cost per unit</strong> — one row per product. A "unit" is the smallest thing you sell or open (TCG in packs, everything else in boxes). Cost is what ONE unit cost you, never a case or invoice total.</p>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>What is this file?</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="importmode" checked={mode === 'add'} onChange={() => setMode('add')} style={{ marginTop: 4 }} />
            <span><strong>New stock that just landed</strong><div className="note">Quantities are <em>added</em> to what's already in the warehouse. Only list what arrived.</div></span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginTop: 6 }}>
            <input type="radio" name="importmode" checked={mode === 'set'} onChange={() => setMode('set')} style={{ marginTop: 4 }} />
            <span><strong>A full stocktake — set levels to match</strong><div className="note">Warehouse quantities are <em>set</em> to the numbers in the file. Safe to re-upload; nothing double-counts. Stock already out with streamers is untouched.</div></span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ ...btn, display: 'inline-block' }}>Choose CSV<input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} /></label>
          <button style={btn} onClick={() => download('mania-import-template.csv', 'Title,Category,Quantity (units),Cost per unit\nChaos Rising,TCG,72,5.52\nTopps Chrome UCC Hobby Box,Soccer,12,85.00\n')}>Download template</button>
          <button style={btn} onClick={exportStock}>Export current stock</button>
        </div>

        {result && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: result.failed.length ? 'rgba(228,0,43,0.08)' : 'rgba(31,157,85,0.10)', color: result.failed.length ? 'var(--red)' : 'var(--good)', fontSize: 13 }}>
            {mode === 'set' ? 'Set' : 'Added'} {result.ok} product{result.ok === 1 ? '' : 's'}.{result.failed.length ? ` ${result.failed.length} failed:` : ''}
            {result.failed.map((f, i) => <div key={i} style={{ marginTop: 4 }}>• {f}</div>)}
          </div>
        )}

        {preview?.errors?.length > 0 && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(228,0,43,0.08)', color: 'var(--red)', fontSize: 13 }}>
            {preview.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}{preview.errors.length > 8 && <div>…and {preview.errors.length - 8} more.</div>}
          </div>
        )}

        {preview?.rows?.length > 0 && (
          <>
            <p className="note">Ready to import <strong>{preview.rows.length}</strong> rows — {topupCount} existing, {newCount} new. Total spend in this file: <strong>{gbp(preview.rows.reduce((a, r) => a + r.qty * r.cost, 0))}</strong>. {mode === 'set' ? 'Existing products will be SET to these quantities.' : 'Quantities will be ADDED to existing stock.'}</p>
            <div className="panel" style={{ padding: 0, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead><tr><th style={th}>Title</th><th style={th}>Category</th><th style={{ ...th, textAlign: 'right' }}>Units</th><th style={{ ...th, textAlign: 'right' }}>Cost / unit</th><th style={th}>Status</th></tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>{r.title}</td>
                      <td style={td}>{r.category ? <span className="pill" style={r.newCategory ? { background: 'var(--orange)', color: '#fff' } : undefined}>{r.category}</span> : <span className="note">—</span>}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.qty}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{gbp(r.cost)}</td>
                      <td style={td}>{r.isNew ? <span className="pill">New</span> : 'Top-up'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn" onClick={runImport} disabled={busy}>{busy ? 'Importing…' : mode === 'set' ? `Set levels for ${preview.rows.length}` : `Add ${preview.rows.length} to stock`}</button>
              <button style={btn} onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
