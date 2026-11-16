import { useState } from 'react'
import { createPortal } from 'react-dom'
import { createSinglesBatch } from '../data'

// ============================================================
// CREATE SINGLES BATCH — a VAT-free (second-hand) stock item that lives in
// inventory like any product. Name + TCG/Sports tag + qty + whole-batch cost.
// Once created it can be assigned to a streamer and run on streams; the unsold
// remainder rolls over automatically.
// ============================================================
const ACCENT = '#5b21b6'
const field = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line, #ddd)', font: 'inherit', width: '100%', boxSizing: 'border-box', background: 'var(--card, #fff)', color: 'inherit' }

export default function CreateSinglesModal({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [dept, setDept] = useState('TCG')
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const unit = (Number(qty) > 0 && Number(cost) >= 0) ? Number(cost) / Number(qty) : null

  const save = async () => {
    setErr(null); setBusy(true)
    try { await createSinglesBatch({ name, dept, qty, cost }); await onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card, #fff)', color: 'inherit', borderRadius: 14, padding: 22, width: 460, maxWidth: '100%' }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>New singles batch</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted, #888)', marginBottom: 16 }}>Creates a VAT-free stock item. Assign it to a streamer, then run it on a stream like any product — the unsold remainder rolls over.</div>
        {err && <div style={{ color: '#c0392b', marginBottom: 10, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Batch name<input style={{ ...field, marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Singles Batch D" /></label>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Tag
            <select style={{ ...field, marginTop: 4 }} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="TCG">TCG</option>
              <option value="Sports">Sports</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Quantity<input style={{ ...field, marginTop: 4 }} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="250" /></label>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Total cost (£)<input style={{ ...field, marginTop: 4 }} type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="540" /></label>
          </div>
          {unit != null && <div style={{ fontSize: 12, color: 'var(--muted, #888)' }}>≈ £{unit.toFixed(2)} per single</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={save} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create batch'}</button>
          <button onClick={onClose} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--line, #ddd)', background: 'var(--card, #fff)', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
