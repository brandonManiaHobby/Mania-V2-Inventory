import { useEffect, useState } from 'react'
import { capabilities } from '../scoping'
import { supabase } from '../supabaseClient'

// ============================================================
// NAV SHELL — V1 visual shell (topbar + group tabs + subnav chips) over V2's
// capability-gated nav, with the V1 topbar tools restored: quick-jump search
// (Ctrl/Cmd-K, managers+), Help, Change password, light/dark, sign out — plus
// the admin "view as role" preview bar.
// ============================================================
const NAV = [
  { id: 'mystock',    label: 'My Stock',      group: 'Streaming',  needs: (c) => c.hasOwnShelf },
  { id: 'record',     label: 'Record stream', group: 'Streaming',  needs: (c) => c.canRecordStream },
  { id: 'past',       label: 'Past streams',  group: 'Streaming',  needs: (c) => c.canRecordStream },
  { id: 'dashboard',  label: 'Dashboard',     group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'streamers',  label: 'Streamers',     group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'products',   label: 'Products',      group: 'Analytics',  needs: (c) => c.seesAllDepartments },
  { id: 'insights',   label: 'Insights',      group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'teams',      label: 'Teams',         group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'inventory',  label: 'Inventory',     group: 'Stock',      needs: (c) => c.seesInventory },
  { id: 'intake',     label: 'Add stock',     group: 'Stock',      needs: (c) => c.canMoveStock },
  { id: 'movestock',  label: 'Move stock',    group: 'Stock',      needs: (c) => c.canMoveStock },
  { id: 'distro',     label: 'Distro sales',  group: 'Stock',      needs: (c) => c.canMoveStock },
  { id: 'consumables',label: 'Consumables',   group: 'Stock',      needs: (c) => c.seesInventory },
  { id: 'finance',    label: 'Finance',       group: 'Finance',    needs: (c) => c.seesAllDepartments },
  { id: 'reports',    label: 'Report builder', group: 'Reporting', needs: (c) => c.seesAllDepartments },
  { id: 'export',     label: 'Export',        group: 'Reporting',  needs: (c) => c.seesAnalytics },
  { id: 'streamlogs', label: 'Stream logs',   group: 'Reporting',  needs: (c) => c.seesAnalytics },
  { id: 'toppssurvey',label: 'Topps survey',  group: 'Reporting',  needs: (c) => c.seesAllDepartments },
  { id: 'admin',      label: 'Admin',         group: 'Admin',      needs: (c) => c.isAdmin },
]
const GROUP_ORDER = ['Streaming', 'Analytics', 'Stock', 'Finance', 'Reporting', 'Admin']
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', lead: 'Lead', warehouse: 'Warehouse', streamer: 'Streamer' }
const DBROLE_LABEL = { admin: 'Admin', manager: 'Manager', channel_lead: 'Lead', warehouse: 'Warehouse', breaker: 'Streamer' }

const Ico = (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p} />
const SunIcon = () => <Ico><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Ico>
const MoonIcon = () => <Ico><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Ico>
const LogoutIcon = () => <Ico><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Ico>
const SearchIcon = () => <Ico><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></Ico>
const HelpIcon = () => <Ico><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Ico>
const KeyIcon = () => <Ico><path d="M21 2l-2 2m-3.5 3.5a5 5 0 1 1-7 7 5 5 0 0 1 7-7zM15 7l4 4" /></Ico>

const VIEWAS_ROLES = [['manager', 'Manager'], ['channel_lead', 'Lead'], ['warehouse', 'Warehouse'], ['breaker', 'Streamer']]

export default function NavShell({ profile, active, onNavigate, onSignOut, viewAs, onViewAs, onExitViewAs, children }) {
  const cap = capabilities(profile)
  const items = NAV.filter((n) => n.needs(cap))
  const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g))
  const activeItem = items.find((i) => i.id === active) || items[0]
  const activeGroup = activeItem ? activeItem.group : groups[0]
  const groupItems = items.filter((i) => i.group === activeGroup)

  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('mania-theme') || 'light' } catch { return 'light' } })
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [pw, setPw] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('mania-theme', theme) } catch { /* ignore */ }
  }, [theme])
  useEffect(() => {
    if (cap.department) document.documentElement.dataset.dept = cap.department
    else delete document.documentElement.dataset.dept
  }, [cap.department])
  // Ctrl/Cmd-K opens quick jump (managers+).
  useEffect(() => {
    if (!cap.seesAnalytics) return
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [cap.seesAnalytics])

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand-home" onClick={() => items[0] && onNavigate(items[0].id)} title="Home" aria-label="Home">
          <img className="brand-logo" src="/mania-logo-white.png" alt="Mania Cards & Collectibles" />
        </button>
        <div className="spacer" />
        <div className="who">{profile?.name} · {ROLE_LABEL[cap.role] || cap.role}{cap.department ? ` · ${cap.department}` : ''}</div>
        {onViewAs && (
          <select className="viewas-select" title="View the app as another role" value={viewAs || ''}
            onChange={(e) => { const v = e.target.value; if (!v) onExitViewAs(); else onViewAs(v) }}>
            <option value="">View as: Admin (you)</option>
            {VIEWAS_ROLES.map(([v, l]) => <option key={v} value={v}>View as: {l}</option>)}
          </select>
        )}
        {cap.seesAnalytics && <button className="icon-btn" title="Quick jump (Ctrl/Cmd-K)" aria-label="Quick jump" onClick={() => setPalette(true)}><SearchIcon /></button>}
        <button className="icon-btn" title="How this works" aria-label="Help" onClick={() => setHelp(true)}><HelpIcon /></button>
        <button className="icon-btn" title="Change password" aria-label="Change password" onClick={() => setPw(true)}><KeyIcon /></button>
        <button className="icon-btn" title="Toggle light / dark" aria-label="Toggle theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}</button>
        <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={onSignOut}><LogoutIcon /></button>
      </header>

      {viewAs && (
        <div className="viewas-bar">
          <span className="viewas-text">Viewing as <strong>{DBROLE_LABEL[viewAs] || viewAs}</strong> — preview of their layout</span>
          <span className="viewas-spacer" />
          <button className="viewas-exit" onClick={onExitViewAs}>Back to Admin</button>
        </div>
      )}

      <nav className="tabs">
        {groups.map((g) => (
          <button key={g} className={'tab' + (activeGroup === g ? ' active' : '')}
            onClick={() => { const first = items.find((i) => i.group === g); if (first) onNavigate(first.id) }}>{g}</button>
        ))}
      </nav>

      {groupItems.length > 1 && (
        <div className="subnav">
          {groupItems.map((i) => (
            <button key={i.id} className={'chip' + (active === i.id ? ' on' : '')} onClick={() => onNavigate(i.id)}>{i.label}</button>
          ))}
        </div>
      )}

      <main className="content">{children}</main>

      {palette && <CommandPalette items={items} onJump={(id) => { onNavigate(id); setPalette(false) }} onClose={() => setPalette(false)} />}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  )
}

// ---- Quick-jump command palette ----
function CommandPalette({ items, onJump, onClose }) {
  const [q, setQ] = useState('')
  const list = items.filter((i) => (i.group + ' ' + i.label).toLowerCase().includes(q.toLowerCase()))
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 440, padding: 0, overflow: 'hidden' }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to…"
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onJump(list[0].id); if (e.key === 'Escape') onClose() }}
          style={{ width: '100%', padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--line)', font: 'inherit', fontSize: 16, background: 'var(--card)', color: 'var(--ink)' }} />
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {list.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)' }}>Nothing matches.</div> : list.map((i) => (
            <button key={i.id} onClick={() => onJump(i.id)} className="cmd-row"
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--ink)' }}>
              <span>{i.label}</span><span style={{ color: 'var(--muted)', fontSize: 12 }}>{i.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Help ----
function HelpModal({ onClose }) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <ModalHead title="How this works" onClose={onClose} />
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)' }}>
          <p><strong>Streaming</strong> — record a stream (gross, optional net/fees, stream URL), review past streams, see your shelf in My Stock.</p>
          <p><strong>Stock</strong> — Add stock brings inventory in; Move stock issues it to streamers or returns it; Distro sales logs B2B/shop sales with invoices.</p>
          <p><strong>Analytics</strong> — Dashboard, Streamers, Products (tap 🔍 to inspect a product), Insights.</p>
          <p><strong>Finance</strong> — spend, VAT report and giveaway write-offs; Export pulls any date range to CSV.</p>
          <p className="note">Press <strong>Ctrl/Cmd-K</strong> anywhere to jump to a screen.</p>
        </div>
      </div>
    </div>
  )
}

// ---- Change password ----
function ChangePassword({ onClose }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const save = async () => {
    setErr(null); setMsg(null)
    if (pw.length < 8) return setErr('Use at least 8 characters')
    if (pw !== pw2) return setErr('The two passwords don’t match')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setErr(error.message); else { setMsg('Password changed ✓'); setPw(''); setPw2('') }
  }
  const field = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--line)', font: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 380 }}>
        <ModalHead title="Change password" onClose={onClose} />
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        {msg && <div className="ok" style={{ marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
          <input style={field} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password" />
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </div>
      </div>
    </div>
  )
}

function ModalHead({ title, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h3 className="h2" style={{ margin: 0, fontSize: 18 }}>{title}</h3>
      <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', zIndex: 60, overflowY: 'auto' }
const sheet = { background: 'var(--card)', borderRadius: 14, maxWidth: 460, width: '100%', padding: 20, boxShadow: 'var(--shadow)' }

export { NAV }
