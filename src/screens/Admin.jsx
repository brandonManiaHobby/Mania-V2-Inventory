import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useSource } from '../data'

// ============================================================
// ADMIN — faithful port of V1's Admin (same functionality, no changes):
// add account, approve/reject pending sign-ups, manage team (role, full-time,
// password reset, delete), clear blocked accounts. Uses the SAME backend:
// the create-user edge function + set_full_time RPC + profiles updates.
// Admin-only (gated in the nav); RLS enforces it server-side too.
// ============================================================
const ROLES = [
  ['breaker', 'Streamer'], ['warehouse', 'Warehouse'], ['channel_lead', 'Lead'],
  ['manager', 'Manager'], ['admin', 'Admin'],
]

async function callUserFn(body) {
  const { data, error } = await supabase.functions.invoke('create-user', { body })
  if (error) {
    let detail = error.message
    try { const b = await error.context?.json?.(); if (b?.error) detail = b.error } catch { /* ignore */ }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function Admin({ scoped, onViewAs }) {
  const { refresh } = useSource()
  const viewer = scoped.cap || {}
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setPeople(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])
  const done = async () => { await load(); refresh() }

  async function setStatus(id, status, role) {
    setMsg('')
    const patch = role ? { status, role } : { status }
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) setMsg(error.message); else done()
  }
  async function setRole(id, role) {
    setMsg('')
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setMsg(error.message); else done()
  }
  async function setFullTime(id, full_time) {
    setMsg('')
    const { error } = await supabase.rpc('set_full_time', { p_streamer_id: id, p_full_time: full_time })
    if (error) setMsg(error.message); else done()
  }
  async function resetPassword(id, name) {
    setMsg(''); setPwMsg('')
    const password = 'Mania-' + Math.random().toString(36).slice(2, 8) + '!'
    try { await callUserFn({ action: 'reset', userId: id, password }); setPwMsg(`New temporary password for ${name}: ${password}`) }
    catch (e) { setMsg("Couldn't reset the password (needs the create-user function deployed). " + e.message) }
  }
  async function deleteUser(id, name) {
    setMsg(''); setPwMsg('')
    if (!window.confirm(`Permanently delete ${name}? This wipes their account and frees their email. It cannot be undone. Their past stream records are kept.`)) return
    try { await callUserFn({ action: 'delete', userId: id }); setPwMsg(`${name} has been permanently deleted.`); done() }
    catch (e) { setMsg("Couldn't delete this account (needs the create-user function deployed). " + e.message) }
  }
  async function rejectUser(id, name) {
    setMsg(''); setPwMsg('')
    if (!window.confirm(`Reject and delete ${name}'s request? This frees their email.`)) return
    try { await callUserFn({ action: 'delete', userId: id }); done() }
    catch (e) { setMsg("Couldn't reject this request (needs the create-user function deployed). " + e.message) }
  }

  if (loading) return <p style={{ color: '#888' }}>Loading people…</p>

  const pending = people.filter((p) => p.status === 'pending')
  const active = people.filter((p) => p.status === 'approved')
  const removed = people.filter((p) => p.status === 'rejected')

  const panel = { padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', marginBottom: 16 }
  const head = { fontWeight: 700, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase', color: '#999', marginBottom: 10 }
  const th = { textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 700, padding: '0 8px 6px' }
  const td = { padding: '7px 8px', fontSize: 13, borderTop: '1px solid #f3f3f3' }
  const sel = { padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit' }
  const btn = (bg, col) => ({ padding: '6px 11px', borderRadius: 8, border: '1px solid ' + (col || '#ddd'), background: bg, color: col || '#333', cursor: 'pointer', fontWeight: 600, fontSize: 12 })

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ marginTop: 0 }}>Admin</h2>
      {msg && <div style={{ color: '#c82828', marginBottom: 10 }}>{msg}</div>}
      {pwMsg && <div style={{ color: '#1a7f37', fontWeight: 600, marginBottom: 10 }}>{pwMsg}</div>}

      {onViewAs && (
        <div style={panel}>
          <div style={head}>View as a role</div>
          <div style={{ fontSize: 13, color: '#777', marginBottom: 10 }}>Jump into another role’s layout to see exactly what they see. Use “Back to Admin” to return.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ROLES.filter(([v]) => v !== 'admin').map(([v, l]) => (
              <button key={v} onClick={() => onViewAs(v)} style={btn('#faf9f7')}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <AddUser onDone={done} />

      {/* Awaiting approval */}
      <div style={panel}>
        <div style={head}>Awaiting approval</div>
        {pending.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>No one waiting.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Approve as</th><th style={th}></th></tr></thead>
            <tbody>{pending.map((p) => <PendingRow key={p.id} p={p} td={td} sel={sel} btn={btn} onApprove={(role) => setStatus(p.id, 'approved', role)} onReject={() => rejectUser(p.id, p.name)} />)}</tbody>
          </table>
        )}
      </div>

      {/* Team */}
      <div style={panel}>
        <div style={head}>Team</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={{ ...th, textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td style={td}>{p.name}</td>
                <td style={td}>{p.email}</td>
                <td style={td}>
                  <select style={sel} value={p.role} onChange={(e) => setRole(p.id, e.target.value)}>
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {p.department === 'Mania TCG' && p.role === 'breaker' && (
                    <label style={{ fontSize: 12, color: '#666', marginRight: 10 }} title="Full-time (salaried) shows contracted hours in Operations">
                      <input type="checkbox" checked={!!p.full_time} onChange={(e) => setFullTime(p.id, e.target.checked)} style={{ marginRight: 4 }} />
                      Full-time
                    </label>
                  )}
                  <button style={btn('#faf9f7')} onClick={() => resetPassword(p.id, p.name)}>Reset password</button>{' '}
                  {viewer && p.id === viewer.userId
                    ? <span style={{ fontSize: 12, color: '#999' }}>you</span>
                    : <button style={btn('#fff', '#c82828')} onClick={() => deleteUser(p.id, p.name)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Blocked */}
      {removed.length > 0 && (
        <div style={panel}>
          <div style={head}>Blocked accounts</div>
          <p style={{ color: '#999', fontSize: 12, marginTop: 0 }}>Left over from the old remove system — their email is still reserved. Delete to free it up for good.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={{ ...th, textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {removed.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...td, opacity: 0.6 }}>{p.name}</td>
                  <td style={{ ...td, opacity: 0.6 }}>{p.email}</td>
                  <td style={{ ...td, textAlign: 'right' }}><button style={btn('#fff', '#c82828')} onClick={() => deleteUser(p.id, p.name)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PendingRow({ p, onApprove, onReject, td, sel, btn }) {
  const [role, setRole] = useState('breaker')
  return (
    <tr>
      <td style={td}>{p.name}</td>
      <td style={td}>{p.email}</td>
      <td style={td}>
        <select style={sel} value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button style={btn('#eafaf0', '#1a7f37')} onClick={() => onApprove(role)}>Approve</button>{' '}
        <button style={btn('#f3f0e8')} onClick={onReject}>Reject</button>
      </td>
    </tr>
  )
}

function AddUser({ onDone }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('breaker')
  const [temp, setTemp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', font: 'inherit', width: '100%' }
  const makeTemp = () => setTemp('Mania-' + Math.random().toString(36).slice(2, 8) + '!')

  async function go() {
    setError(''); setOk(''); setBusy(true)
    const password = temp || ('Mania-' + Math.random().toString(36).slice(2, 8) + '!')
    try {
      await callUserFn({ name, email, role, password })
      setOk(`Account created for ${email}. Temporary password: ${password}`)
      setName(''); setEmail(''); setTemp(''); onDone?.()
    } catch (e) {
      setError("Couldn't create the account: " + e.message + '. If this email was used before, delete that account under "Blocked accounts" to free it up.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase', color: '#999', marginBottom: 10 }}>Add an account</div>
      {error && <div style={{ color: '#c82828', marginBottom: 8 }}>{error}</div>}
      {ok && <div style={{ color: '#1a7f37', fontWeight: 600, marginBottom: 8 }}>{ok}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 180 }}>Full name<br /><input style={{ ...field, marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 180 }}>Email<br /><input style={{ ...field, marginTop: 4 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'end' }}>
        <label style={{ fontSize: 13, color: '#444' }}>Role<br />
          <select style={{ ...field, marginTop: 4, width: 160 }} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#444', flex: 1, minWidth: 200 }}>Temporary password<br />
          <span style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input style={field} value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Auto-generated if blank" />
            <button type="button" onClick={makeTemp} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#faf9f7', cursor: 'pointer', whiteSpace: 'nowrap' }}>Generate</button>
          </span>
        </label>
      </div>
      <button onClick={go} disabled={busy || !email || !name}
        style={{ marginTop: 12, padding: '9px 18px', borderRadius: 10, border: 'none', background: (busy || !email || !name) ? '#ccc' : '#1a7f37', color: '#fff', fontWeight: 700, cursor: (busy || !email || !name) ? 'default' : 'pointer' }}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </div>
  )
}
