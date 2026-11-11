import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { gbp, gbp0, saveCardShow, saveShowEntry, deleteShowEntry, saveShowCost, deleteShowCost } from '../data'

// Shared logic + components for the Shows tab (Record show + Previous shows).

export const DEPARTMENTS = ['TCG', 'Sports']
export const entrySales = (e) => (e.salesCash || 0) + (e.salesCard || 0) + (e.salesTransfer || 0)
export const nameOf = (profiles, id) => profiles.find((p) => p.id === id)?.name || '—'
export const fmtH = (h) => (Math.round(h * 10) / 10).toFixed(1) + 'h'

export function fmtDates(s) {
  const d = (x) => new Date(x + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!s.startDate) return '—'
  if (s.endDate && s.endDate !== s.startDate) return `${d(s.startDate)} – ${d(s.endDate)}`
  return d(s.startDate)
}

export function totalsFor(show, entries, costs) {
  const es = entries.filter((e) => e.showId === show.id)
  const cs = costs.filter((c) => c.showId === show.id)
  const sales = es.reduce((a, e) => a + entrySales(e), 0)
  const profit = es.reduce((a, e) => a + (e.profit || 0), 0)
  const cost = cs.reduce((a, c) => a + (c.amount || 0), 0)
  const hours = es.reduce((a, e) => a + (e.hours || 0), 0)
  return {
    es, cs, sales, profit, cost, hours,
    revPerHour: show.operatingHours > 0 ? sales / show.operatingHours : null,
    revPerDay: show.days > 0 ? sales / show.days : null,
    depts: [...new Set(es.map((e) => e.department).filter(Boolean))],
  }
}

// The full show editor body: details form, derived metrics, entries, costs.
// Used inline by Record show, and inside the modal by Previous shows.
export function ShowEditorBody({ row, profiles, allEntries, allCosts, onChanged, onSaved }) {
  const [f, setF] = useState({
    id: row.id, name: row.name || '', location: row.location || '',
    startDate: row.startDate || '', endDate: row.endDate || '',
    days: row.days ?? 1, operatingHours: row.operatingHours ?? '', notes: row.notes || '',
  })
  const [savedId, setSavedId] = useState(row.id || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const show = { ...f, id: savedId }
  const t = useMemo(() => totalsFor(show, allEntries, allCosts), [show, allEntries, allCosts])

  async function saveDetails() {
    setBusy(true); setErr(null)
    try {
      const id = await saveCardShow({ ...f })
      setSavedId(id); setF((s) => ({ ...s, id })); onSaved && onSaved(id); await onChanged()
    } catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && <div className="error">{err}</div>}
      <Field label="Show / venue"><input style={field} value={f.name} onChange={set('name')} placeholder="e.g. London Card Show" /></Field>
      <div style={row2}><Field label="Location" grow><input style={field} value={f.location} onChange={set('location')} placeholder="Town / city" /></Field></div>
      <div style={row2}>
        <Field label="Start date" grow><input style={field} type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="End date" grow><input style={field} type="date" value={f.endDate} onChange={set('endDate')} /></Field>
      </div>
      <div style={row2}>
        <Field label="Duration (days)" grow><input style={field} type="number" step="0.5" value={f.days} onChange={set('days')} /></Field>
        <Field label="Venue operating hours" grow><input style={field} type="number" step="0.5" value={f.operatingHours} onChange={set('operatingHours')} placeholder="total hours open" /></Field>
      </div>
      <Field label="Notes"><input style={field} value={f.notes} onChange={set('notes')} /></Field>
      <button className="btn" onClick={saveDetails} disabled={busy}>{busy ? 'Saving…' : (savedId ? 'Save show details' : 'Create show')}</button>

      {savedId && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
            <Metric label="Total sales" value={gbp0(t.sales)} />
            <Metric label="Total profit" value={gbp0(t.profit)} tone={t.profit >= 0 ? 'good' : 'bad'} />
            <Metric label="Total costs" value={gbp0(t.cost)} />
            <Metric label="Hours" value={fmtH(t.hours)} />
            <Metric label="Rev / hour" value={t.revPerHour != null ? gbp0(t.revPerHour) : '—'} />
            <Metric label="Rev / day" value={t.revPerDay != null ? gbp0(t.revPerDay) : '—'} />
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <Group label="Department entries (time · sales · profit)" />
            <EntriesEditor showId={savedId} entries={t.es} profiles={profiles} onChanged={onChanged} />
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <Group label="Costs" />
            <CostsEditor showId={savedId} costs={t.cs} profiles={profiles} onChanged={onChanged} />
          </div>
        </>
      )}
    </div>
  )
}

export function ShowModal({ row, profiles, allEntries, allCosts, onClose, onChanged, onDelete }) {
  return createPortal((
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="h2" style={{ margin: 0, fontSize: 18 }}>{row.name || 'Show'}</h3>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        <ShowEditorBody row={row} profiles={profiles} allEntries={allEntries} allCosts={allCosts} onChanged={onChanged} />
        {row.id && <button className="btn ghost" style={{ color: 'var(--bad)', marginTop: 12 }} onClick={() => { onClose(); onDelete(row) }}>Delete show</button>}
      </div>
    </div>
  ), document.body)
}

function EntriesEditor({ showId, entries, profiles, onChanged }) {
  const blank = { profileId: '', department: 'TCG', hours: '', overnight: false, salesCash: '', salesCard: '', salesTransfer: '', profit: '' }
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const taken = new Set(entries.filter((x) => !form.id || x.id !== form.id).map((x) => x.profileId))
  const available = profiles.filter((p) => !taken.has(p.id)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  async function save() {
    if (!form.profileId) return
    setBusy(true)
    try { await saveShowEntry(showId, form); setForm(blank); await onChanged() }
    catch (e) { alert(e.message || String(e)) } finally { setBusy(false) }
  }
  async function remove(id) { try { await deleteShowEntry(id); if (form.id === id) setForm(blank); await onChanged() } catch (e) { alert(e.message || String(e)) } }
  function edit(x) { setForm({ id: x.id, profileId: x.profileId, department: x.department || 'TCG', hours: x.hours ?? '', overnight: !!x.overnight, salesCash: x.salesCash ?? '', salesCard: x.salesCard ?? '', salesTransfer: x.salesTransfer ?? '', profit: x.profit ?? '' }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((x) => (
        <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '8px 11px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, flex: '1 1 120px' }}>{nameOf(profiles, x.profileId)} <Chip>{x.department || '—'}</Chip></span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtH(x.hours)}{x.overnight ? ' · O/N' : ''} · {gbp(entrySales(x))} sales · {gbp(x.profit || 0)} profit</span>
          <button onClick={() => edit(x)} className="btn ghost" style={{ padding: '4px 9px', fontSize: 12 }}>Edit</button>
          <button onClick={() => remove(x.id)} style={{ ...xBtn, fontSize: 18 }}>×</button>
        </div>
      ))}
      <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{form.id ? 'Edit entry' : 'Add an entry'}</div>
        <div style={row2}>
          <select value={form.profileId} onChange={set('profileId')} style={{ ...field, flex: '2 1 130px' }}>
            <option value="">Person…</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={form.department} onChange={set('department')} style={{ ...field, flex: '1 1 90px' }}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input style={{ ...field, flex: '1 1 70px', maxWidth: 90 }} type="number" step="0.5" placeholder="Hours" value={form.hours} onChange={set('hours')} />
          <label style={{ ...chkLbl, padding: 0 }}><input type="checkbox" checked={form.overnight} onChange={set('overnight')} /> O/N</label>
        </div>
        <div style={row2}>
          <Field label="Cash" grow><input style={field} type="number" step="0.01" value={form.salesCash} onChange={set('salesCash')} /></Field>
          <Field label="Card" grow><input style={field} type="number" step="0.01" value={form.salesCard} onChange={set('salesCard')} /></Field>
          <Field label="Transfer" grow><input style={field} type="number" step="0.01" value={form.salesTransfer} onChange={set('salesTransfer')} /></Field>
          <Field label="Profit" grow><input style={field} type="number" step="0.01" value={form.profit} onChange={set('profit')} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={save} disabled={busy || !form.profileId} style={{ padding: '7px 14px' }}>{form.id ? 'Save entry' : 'Add entry'}</button>
          {form.id && <button className="btn ghost" onClick={() => setForm(blank)} style={{ padding: '7px 14px' }}>Cancel</button>}
        </div>
      </div>
    </div>
  )
}

function CostsEditor({ showId, costs, profiles, onChanged }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [pid, setPid] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!label.trim()) return
    setBusy(true)
    try { await saveShowCost(showId, { label, amount, profileId: pid || null }); setLabel(''); setAmount(''); setPid(''); await onChanged() }
    catch (e) { alert(e.message || String(e)) } finally { setBusy(false) }
  }
  async function remove(id) { try { await deleteShowCost(id); await onChanged() } catch (e) { alert(e.message || String(e)) } }
  const total = costs.reduce((a, c) => a + (c.amount || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {costs.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '7px 11px' }}>
          <span style={{ flex: 1 }}>{c.label}{c.profileId ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {nameOf(profiles, c.profileId)}</span> : ''}</span>
          <span style={{ fontWeight: 600 }}>{gbp(c.amount)}</span>
          <button onClick={() => remove(c.id)} style={{ ...xBtn, fontSize: 18 }}>×</button>
        </div>
      ))}
      {costs.length > 0 && <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>Total costs: <strong>{gbp(total)}</strong></div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...field, flex: '2 1 120px' }} placeholder="Cost (e.g. Van hire)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={{ ...field, flex: '1 1 80px', maxWidth: 110 }} type="number" step="0.01" placeholder="£" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ ...field, flex: '1 1 110px' }}>
          <option value="">Shared</option>
          {profiles.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn ghost" onClick={add} disabled={busy || !label.trim()} style={{ padding: '7px 12px' }}>Add</button>
      </div>
    </div>
  )
}

export function Chip({ children }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--muted)' }}>{children}</span>
}
export function Figure({ label, value, tone, big }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: big ? 18 : 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--ink)' }}>{value}</div>
    </div>
  )
}
export function StatPill({ label, value, tone }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 14px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--ink)' }}>{value}</div>
    </div>
  )
}
function Metric({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--ink)' }}>{value}</div>
    </div>
  )
}
function Field({ label, grow, children }) {
  return <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: grow ? '1 1 120px' : '1 1 auto', minWidth: grow ? 90 : undefined }}><label>{label}</label>{children}</div>
}
function Group({ label }) {
  return <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', zIndex: 60, overflowY: 'auto' }
const sheet = { background: 'var(--card)', borderRadius: 14, maxWidth: 580, width: '100%', padding: 20, boxShadow: 'var(--shadow)', margin: 'auto' }
const field = { width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)' }
const row2 = { display: 'flex', gap: 10, flexWrap: 'wrap' }
const chkLbl = { display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, color: 'var(--ink)', padding: '8px 0', whiteSpace: 'nowrap' }
const xBtn = { border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }
