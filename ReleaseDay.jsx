import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSource, gbp, displaySport, sportColour, saveRelease, deleteRelease } from '../data'

// ============================================================
// RELEASE DAY — management calendar of upcoming Topps product releases.
// A month grid pinpoints exact drop days; every populated day opens a
// detail pop-out (same inspect pattern as the rest of the app). Below it,
// the full upcoming / TBD / released list. Live GMT countdown throughout.
// Topps terms mapped on display: "Football" -> American Football,
// "Soccer" -> Football. Admin/manager also see & edit the MD/Xero invoice.
// ============================================================

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ACCENT = '#4f46e5'

function instantOf(r) {
  if (!r.releaseDate) return null
  const time = r.releaseTimeUtc || '00:00:00'
  const d = new Date(`${r.releaseDate}T${time.length === 5 ? time + ':00' : time}Z`)
  return isNaN(d.getTime()) ? null : d
}
function fmtGmt(date, withTime) {
  if (!date) return 'Date TBD'
  const base = { timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }
  const opts = withTime ? { ...base, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : base
  return new Intl.DateTimeFormat('en-GB', opts).format(date)
}
function fmtLeft(ms, withSeconds) {
  if (ms == null) return '—'
  if (ms <= 0) return 'Released'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d > 0) return withSeconds ? `${d}d ${h}h ${m}m ${sec}s` : `${d}d ${h}h ${m}m`
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const shortName = (p) => (p || '').replace(/^\d{4}(-\d{2})?\s+/, '').replace(/^Topps\s+/, '').replace(/^Bowman(\sU)?\s+/, 'Bowman ')

const INV_LABEL = { none: 'Not raised', raised: 'Raised', paid: 'Paid' }
const INV_COLOUR = { none: 'var(--muted)', raised: '#d97706', paid: 'var(--good)' }

export default function ReleaseDay({ scoped }) {
  const { refresh } = useSource()
  const canEdit = !!scoped?.cap?.seesAllDepartments
  const rows = scoped?.releaseCalendar || []

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const [editing, setEditing] = useState(null)  // row | {} (new) | {releaseDate} (new on day)
  const [dayKey, setDayKey] = useState(null)     // 'YYYY-MM-DD' opened in day pop-out
  const [showPast, setShowPast] = useState(false)
  const [cursor, setCursor] = useState(null)     // {y,m}

  const enriched = useMemo(() => rows.map((r) => {
    const at = instantOf(r)
    return { ...r, at, ms: at ? at.getTime() - now : null }
  }), [rows, now])

  const upcoming = enriched.filter((r) => r.at && r.ms > 0).sort((a, b) => a.ms - b.ms)
  const past = enriched.filter((r) => r.at && r.ms <= 0).sort((a, b) => b.at - a.at)
  const tbd = enriched.filter((r) => !r.at)
  const next = upcoming[0] || null

  // Default the calendar to the month of the next release.
  const view = cursor || (next ? { y: next.at.getUTCFullYear(), m: next.at.getUTCMonth() } : (() => { const d = new Date(); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })())

  // Releases grouped by their date key, for the grid + day pop-out.
  const byDay = useMemo(() => {
    const map = {}
    for (const r of enriched) if (r.releaseDate) (map[r.releaseDate] || (map[r.releaseDate] = [])).push(r)
    return map
  }, [enriched])

  async function doDelete(r) {
    if (!window.confirm(`Remove "${r.product}" from the calendar?`)) return
    try { await deleteRelease(r.id); await refresh() } catch (e) { alert(e.message || String(e)) }
  }

  // ---- build the month grid cells (Monday-first) ----
  const { y, m } = view
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const td = new Date(); const todayKey = `${td.getUTCFullYear()}-${td.getUTCMonth()}-${td.getUTCDate()}`
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ d, key, isToday: `${y}-${m}-${d}` === todayKey, list: byDay[key] || [] })
  }

  const dayRows = dayKey ? (byDay[dayKey] || []) : []

  return (
    <div>
      {rows.length === 0 && (
        <div className="empty">
          No releases loaded yet. {canEdit ? 'Add one, or run the release-calendar migration to seed the Topps schedule.' : 'The calendar hasn’t been set up yet.'}
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="btn" onClick={() => setEditing({})}>+ Add release</button>
        </div>
      )}

      {next && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: ACCENT }} />
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: ACCENT }}>Next release</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', marginTop: 3, lineHeight: 1.2 }}>{next.product}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <SportChip sport={next.sport} />{next.isBowman && <Tag>Bowman</Tag>}
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{fmtGmt(next.at, next.timeConfirmed)}{!next.timeConfirmed && ' · time TBC'}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{fmtLeft(next.ms, true)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)' }}>until release</div>
          </div>
        </div>
      )}

      {/* MONTH CALENDAR */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{MONTHS[m]} {y}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <CalBtn onClick={() => setCursor({ y: m === 0 ? y - 1 : y, m: (m + 11) % 12 })}>‹</CalBtn>
            <CalBtn onClick={() => setCursor(next ? { y: next.at.getUTCFullYear(), m: next.at.getUTCMonth() } : { y: td.getUTCFullYear(), m: td.getUTCMonth() })}>•</CalBtn>
            <CalBtn onClick={() => setCursor({ y: m === 11 ? y + 1 : y, m: (m + 1) % 12 })}>›</CalBtn>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const has = c.list.length > 0
            return (
              <div key={i} onClick={has ? () => setDayKey(c.key) : undefined}
                style={{
                  minHeight: 72, borderRadius: 9, padding: '4px 4px 5px', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden',
                  background: c.isToday ? 'rgba(245,158,11,0.10)' : 'var(--card)',
                  border: `1px solid ${c.isToday ? '#f59e0b' : 'var(--line)'}`,
                  cursor: has ? 'pointer' : 'default',
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.isToday ? '#b45309' : 'var(--muted)', textAlign: 'right', lineHeight: 1 }}>{c.d}</div>
                {c.list.slice(0, 3).map((r) => (
                  <span key={r.id} title={r.product} style={{ fontSize: 9.5, fontWeight: 600, color: '#fff', background: sportColour(r.sport), borderRadius: 4, padding: '2px 4px', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(r.product)}</span>
                ))}
                {c.list.length > 3 && <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--muted)' }}>+{c.list.length - 3} more</span>}
              </div>
            )
          })}
        </div>
        <Legend rows={enriched} />
      </div>

      {upcoming.length > 0 && (
        <Section title={`All upcoming (${upcoming.length})`}>
          {upcoming.map((r) => <ReleaseRow key={r.id} r={r} canEdit={canEdit} onEdit={() => setEditing(r)} onDelete={() => doDelete(r)} />)}
        </Section>
      )}
      {tbd.length > 0 && (
        <Section title={`Date TBD (${tbd.length})`}>
          {tbd.map((r) => <ReleaseRow key={r.id} r={r} canEdit={canEdit} onEdit={() => setEditing(r)} onDelete={() => doDelete(r)} />)}
        </Section>
      )}
      {past.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="btn ghost" onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide' : 'Show'} released ({past.length})</button>
          {showPast && <div style={{ marginTop: 12 }}>{past.map((r) => <ReleaseRow key={r.id} r={r} past canEdit={canEdit} onEdit={() => setEditing(r)} onDelete={() => doDelete(r)} />)}</div>}
        </div>
      )}

      {dayKey && (
        <DayModal dateLabel={fmtGmt(instantOf({ releaseDate: dayKey }), false)} rows={dayRows} canEdit={canEdit}
          onClose={() => setDayKey(null)}
          onEdit={(r) => { setDayKey(null); setEditing(r) }}
          onAdd={() => { setDayKey(null); setEditing({ releaseDate: dayKey }) }}
          onDelete={doDelete} />
      )}
      {editing && (
        <EditReleaseModal row={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh() }} />
      )}
    </div>
  )
}

function CalBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ font: 'inherit', fontSize: 15, lineHeight: 1, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>{children}</button>
}

function Legend({ rows }) {
  const sports = [...new Set(rows.map((r) => displaySport(r.sport)))]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
      {sports.map((s) => (
        <span key={s} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
          <i style={{ width: 9, height: 9, borderRadius: 3, background: sportColour(s) }} />{s}
        </span>
      ))}
    </div>
  )
}

// ---- DAY POP-OUT (same inspect pattern as other modals) ----
function DayModal({ dateLabel, rows, canEdit, onClose, onEdit, onAdd, onDelete }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return createPortal((
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 className="h2" style={{ margin: 0, fontSize: 18 }}>{dateLabel}</h3>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>{rows.length} release{rows.length === 1 ? '' : 's'} this day</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => {
            const at = instantOf(r); const ms = at ? at.getTime() - now : null
            return (
              <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink)', flex: '1 1 220px' }}>{r.product}</div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: ms != null && ms <= 0 ? 'var(--muted)' : 'var(--ink)' }}>{fmtLeft(ms, false)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <SportChip sport={r.sport} />{r.isBowman && <Tag>Bowman</Tag>}
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtGmt(at, r.timeConfirmed)}{!r.timeConfirmed && ' · time TBC'}</span>
                </div>
                {canEdit && (r.invoiceRef || r.invoiceAmount != null || r.invoiceDue) && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, color: INV_COLOUR[r.invoiceStatus || 'none'], border: `1px solid ${INV_COLOUR[r.invoiceStatus || 'none']}` }}>Invoice: {INV_LABEL[r.invoiceStatus || 'none']}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.invoiceRef ? `${r.invoiceRef} · ` : ''}{r.invoiceAmount != null ? gbp(r.invoiceAmount) : ''}{r.invoiceDue ? ` · due ${r.invoiceDue}` : ''}</span>
                  </div>
                )}
                {r.notes && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>{r.notes}</div>}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn ghost" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => onEdit(r)}>Edit</button>
                    <button className="btn ghost" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => onDelete(r)}>Remove</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {canEdit && <button className="btn" style={{ marginTop: 14 }} onClick={onAdd}>+ Add release on this day</button>}
      </div>
    </div>
  ), document.body)
}

function ReleaseRow({ r, past, canEdit, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderBottom: '1px solid var(--line)', opacity: past ? 0.6 : 1 }}>
      <div style={{ flex: '1 1 260px', minWidth: 200 }}>
        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.product}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
          <SportChip sport={r.sport} />{r.isBowman && <Tag>Bowman</Tag>}
          {canEdit && r.invoiceRef && <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, color: INV_COLOUR[r.invoiceStatus || 'none'], border: `1px solid ${INV_COLOUR[r.invoiceStatus || 'none']}` }}>Invoice: {INV_LABEL[r.invoiceStatus || 'none']}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 150 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{fmtGmt(r.at, r.timeConfirmed)}</div>
        {!r.at ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>awaiting date</div>
          : <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: past ? 13 : 15, fontWeight: 700, color: past ? 'var(--muted)' : 'var(--ink)' }}>{fmtLeft(r.ms, false)}</div>}
        {r.at && !r.timeConfirmed && !past && <div style={{ fontSize: 11, color: 'var(--muted)' }}>time TBC</div>}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={onEdit}>Edit</button>
          <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={onDelete}>✕</button>
        </div>
      )}
    </div>
  )
}

function SportChip({ sport }) {
  if (!sport) return null
  return <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, padding: '2px 9px', borderRadius: 999, color: '#fff', background: sportColour(sport), whiteSpace: 'nowrap' }}>{displaySport(sport)}</span>
}
function Tag({ children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: 'var(--muted)', border: '1px solid var(--line)' }}>{children}</span>
}
function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}
function PageHead({ eyebrow, title, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '14px 18px', marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>{eyebrow}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right', maxWidth: 420, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

// ---- ADD / EDIT MODAL ----
const SPORTS = [
  ['Football', 'American Football (Topps "Football")'],
  ['Soccer', 'Football / soccer (Topps "Soccer")'],
  ['Baseball', 'Baseball'], ['Basketball', 'Basketball'], ['Tennis', 'Tennis'],
  ['Formula 1', 'Formula 1'], ['Cricket', 'Cricket'], ['Wrestling', 'Wrestling'], ['MMA', 'MMA'], ['Non-Sport', 'Non-Sport'],
]
function EditReleaseModal({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    id: row.id,
    product: row.product || '', sport: row.sport || '',
    releaseDate: row.releaseDate || '',
    releaseTimeUtc: row.releaseTimeUtc ? String(row.releaseTimeUtc).slice(0, 5) : '',
    timeConfirmed: !!row.timeConfirmed, isBowman: !!row.isBowman, status: row.status || 'scheduled',
    invoiceRef: row.invoiceRef || '', invoiceAmount: row.invoiceAmount == null ? '' : row.invoiceAmount,
    invoiceDue: row.invoiceDue || '', invoiceStatus: row.invoiceStatus || 'none', notes: row.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save() {
    setBusy(true); setErr(null)
    try { await saveRelease({ ...f, releaseTimeUtc: f.releaseTimeUtc || null }); await onSaved() }
    catch (e) { setErr(e.message || String(e)); setBusy(false) }
  }
  return createPortal((
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="h2" style={{ margin: 0, fontSize: 18 }}>{row.id ? 'Edit release' : 'Add release'}</h3>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Product"><input style={field} value={f.product} onChange={set('product')} placeholder="2026 Topps Chrome Football" /></Field>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Field label="Sport (Topps label)" grow>
              <select style={field} value={f.sport} onChange={set('sport')}>
                <option value="">—</option>{SPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Release date" grow><input style={field} type="date" value={f.releaseDate} onChange={set('releaseDate')} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Release time (GMT, optional)" grow><input style={field} type="time" value={f.releaseTimeUtc} onChange={set('releaseTimeUtc')} /></Field>
            <label style={chkLbl}><input type="checkbox" checked={f.timeConfirmed} onChange={set('timeConfirmed')} /> Time confirmed</label>
            <label style={chkLbl}><input type="checkbox" checked={f.isBowman} onChange={set('isBowman')} /> Bowman</label>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 8 }}>MD / Xero invoice</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Field label="Invoice ref" grow><input style={field} value={f.invoiceRef} onChange={set('invoiceRef')} placeholder="Distro → 101" /></Field>
              <Field label="Amount (£)" grow><input style={field} type="number" step="0.01" value={f.invoiceAmount} onChange={set('invoiceAmount')} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <Field label="Payment due" grow><input style={field} type="date" value={f.invoiceDue} onChange={set('invoiceDue')} /></Field>
              <Field label="Status" grow>
                <select style={field} value={f.invoiceStatus} onChange={set('invoiceStatus')}>
                  <option value="none">Not raised</option><option value="raised">Raised</option><option value="paid">Paid</option>
                </select>
              </Field>
            </div>
          </div>
          <Field label="Notes"><input style={field} value={f.notes} onChange={set('notes')} /></Field>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : (row.id ? 'Save changes' : 'Add release')}</button>
        </div>
      </div>
    </div>
  ), document.body)
}
function Field({ label, grow, children }) {
  return (
    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: grow ? '1 1 160px' : '1 1 auto', minWidth: grow ? 150 : undefined }}>
      <label>{label}</label>{children}
    </div>
  )
}
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', zIndex: 60, overflowY: 'auto' }
const sheet = { background: 'var(--card)', borderRadius: 14, maxWidth: 520, width: '100%', padding: 20, boxShadow: 'var(--shadow)', margin: 'auto' }
const field = { width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)' }
const chkLbl = { display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, color: 'var(--ink)', padding: '8px 0' }
const xBtn = { border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }
