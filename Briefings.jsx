import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSource, displaySport, sportColour, saveBriefing, deleteBriefing } from '../data'

// ============================================================
// PRODUCT BRIEFING — the pre-release info sheets that come through for each
// upcoming product (configuration, hit rates, key dates). Visible to everyone;
// admin/manager can add/edit/delete. Rows arrive either manually here or from
// the email feed (source = 'email'), which inserts into the same table.
// ============================================================

const ACCENT = '#4f46e5'

function fmtDate(d) {
  if (!d) return null
  const dt = new Date(`${d}T00:00:00Z`)
  if (isNaN(dt.getTime())) return d
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric' }).format(dt)
}
function fmtReceived(ts) {
  if (!ts) return null
  const dt = new Date(ts)
  if (isNaN(dt.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(dt)
}

export default function Briefings({ scoped }) {
  const { refresh } = useSource()
  const canEdit = !!scoped?.cap?.seesAllDepartments
  const rows = scoped?.briefings || []
  const [editing, setEditing] = useState(null)   // row | {} (new)
  const [err, setErr] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // New first, then by release date (soonest first), then most recently received.
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if ((a.status === 'new') !== (b.status === 'new')) return a.status === 'new' ? -1 : 1
      const ad = a.releaseDate || '9999', bd = b.releaseDate || '9999'
      if (ad !== bd) return ad < bd ? -1 : 1
      return (b.receivedAt || b.createdAt || '').localeCompare(a.receivedAt || a.createdAt || '')
    })
  }, [rows])

  const markReviewed = async (r) => {
    setErr(null); setBusyId(r.id)
    try { await saveBriefing({ ...r, status: 'reviewed' }); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }
  const remove = async (r) => {
    if (!window.confirm(`Delete the briefing for “${r.product}”?`)) return
    setErr(null); setBusyId(r.id)
    try { await deleteBriefing(r.id); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          {rows.length} briefing{rows.length === 1 ? '' : 's'}
          {rows.some((r) => r.status === 'new') && <span style={{ marginLeft: 8, color: ACCENT, fontWeight: 700 }}>· {rows.filter((r) => r.status === 'new').length} new</span>}
        </div>
        {canEdit && (
          <button onClick={() => setEditing({})} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>+ Add briefing</button>
        )}
      </div>

      {err && <div style={{ color: '#c0392b', marginBottom: 10, fontSize: 13 }}>{err}</div>}

      {sorted.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border, #ddd)', borderRadius: 12, color: 'var(--muted)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No briefings yet</div>
          <div style={{ fontSize: 13, maxWidth: 440, margin: '0 auto' }}>Product briefings for upcoming releases will appear here as they come in — configuration, hit rates and key dates.{canEdit ? ' Add one manually with the button above, or wire up the email feed to drop them in automatically.' : ''}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sorted.map((r) => {
            const sport = r.sport ? displaySport(r.sport) : null
            const col = r.sport ? sportColour(r.sport) : ACCENT
            return (
              <div key={r.id} style={{ border: '1px solid var(--border, #e6e6e6)', borderLeft: `3px solid ${col}`, borderRadius: 12, padding: 16, background: 'var(--card, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{r.product}</span>
                      {sport && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, color: col, border: `1px solid ${col}` }}>{sport}</span>}
                      {r.status === 'new' && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, color: '#fff', background: ACCENT }}>New</span>}
                    </div>
                    {r.releaseDate && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>Release: {fmtDate(r.releaseDate)}</div>}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {r.status === 'new' && <button onClick={() => markReviewed(r)} disabled={busyId === r.id} style={btnGhost}>Mark reviewed</button>}
                      <button onClick={() => setEditing(r)} disabled={busyId === r.id} style={btnGhost}>Edit</button>
                      <button onClick={() => remove(r)} disabled={busyId === r.id} style={{ ...btnGhost, color: '#c0392b', borderColor: '#e0b4b4' }}>Delete</button>
                    </div>
                  )}
                </div>

                {r.summary && <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.summary}</div>}

                {r.configuration && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 4 }}>Configuration</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--bg-subtle, #f7f7f9)', borderRadius: 8, padding: '8px 10px' }}>{r.configuration}</div>
                  </div>
                )}

                {r.notes && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{r.notes}</div>}

                {(r.source === 'email' || r.sourceRef || r.receivedAt) && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border, #eee)', fontSize: 11.5, color: 'var(--muted)' }}>
                    {r.source === 'email' ? '✉ From email' : 'Added manually'}
                    {r.sourceRef ? ` · ${r.sourceRef}` : ''}
                    {fmtReceived(r.receivedAt) ? ` · received ${fmtReceived(r.receivedAt)}` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && canEdit && <BriefingEditor row={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh() }} />}
    </div>
  )
}

const btnGhost = { padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border, #ddd)', background: 'var(--card, #fff)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }
const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #ddd)', font: 'inherit', width: '100%', boxSizing: 'border-box', background: 'var(--card, #fff)', color: 'inherit' }

function BriefingEditor({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    product: row.product || '', sport: row.sport || '', releaseDate: row.releaseDate || '',
    summary: row.summary || '', configuration: row.configuration || '', notes: row.notes || '',
    status: row.status || 'new',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    setErr(null); setBusy(true)
    try { await saveBriefing({ ...row, ...f }); await onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card, #fff)', color: 'inherit', borderRadius: 14, padding: 22, width: 540, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>{row.id ? 'Edit briefing' : 'Add briefing'}</div>
        {err && <div style={{ color: '#c0392b', marginBottom: 10, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Product<input style={{ ...field, marginTop: 4 }} value={f.product} onChange={set('product')} placeholder="2025 Topps Chrome Baseball" /></label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 160 }}>Sport<input style={{ ...field, marginTop: 4 }} value={f.sport} onChange={set('sport')} placeholder="Baseball" /></label>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 160 }}>Release date<input style={{ ...field, marginTop: 4 }} type="date" value={f.releaseDate} onChange={set('releaseDate')} /></label>
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Summary<textarea style={{ ...field, marginTop: 4, minHeight: 80, resize: 'vertical' }} value={f.summary} onChange={set('summary')} placeholder="Key details from the briefing…" /></label>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Configuration<textarea style={{ ...field, marginTop: 4, minHeight: 70, resize: 'vertical' }} value={f.configuration} onChange={set('configuration')} placeholder="Box/case config, hits per box, parallels…" /></label>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Notes<textarea style={{ ...field, marginTop: 4, minHeight: 50, resize: 'vertical' }} value={f.notes} onChange={set('notes')} /></label>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Status
            <select style={{ ...field, marginTop: 4 }} value={f.status} onChange={set('status')}>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={save} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save briefing'}</button>
          <button onClick={onClose} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border, #ddd)', background: 'var(--card, #fff)', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
