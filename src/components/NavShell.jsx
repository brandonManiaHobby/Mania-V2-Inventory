import { useEffect, useState } from 'react'
import { capabilities } from '../scoping'

// ============================================================
// NAV SHELL — V1 visual shell (topbar + group tabs + subnav chips) over V2's
// capability-gated nav. Each item declares the capability flag that gates it;
// the shell groups them into V1's top tabs with a chip subnav, exactly like V1.
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
  { id: 'finance',    label: 'Finance',       group: 'Finance',    needs: (c) => c.seesAllDepartments },
  { id: 'export',     label: 'Export',        group: 'Reporting',  needs: (c) => c.seesAnalytics },
  { id: 'toppssurvey',label: 'Topps survey',  group: 'Reporting',  needs: (c) => c.seesAllDepartments },
  { id: 'admin',      label: 'Admin',         group: 'Admin',      needs: (c) => c.isAdmin },
]
const GROUP_ORDER = ['Streaming', 'Analytics', 'Stock', 'Finance', 'Reporting', 'Admin']
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', lead: 'Lead', warehouse: 'Warehouse', streamer: 'Streamer' }

const SunIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
const MoonIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
const LogoutIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>

export default function NavShell({ profile, active, onNavigate, onSignOut, children }) {
  const cap = capabilities(profile)
  const items = NAV.filter((n) => n.needs(cap))
  const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g))
  const activeItem = items.find((i) => i.id === active) || items[0]
  const activeGroup = activeItem ? activeItem.group : groups[0]
  const groupItems = items.filter((i) => i.group === activeGroup)

  // Light / dark theme — persisted, applied on the document root (V1 behaviour).
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('mania-theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('mania-theme', theme) } catch { /* ignore */ }
  }, [theme])
  // Department theming hook (V1 styles key on data-dept).
  useEffect(() => {
    if (cap.department) document.documentElement.dataset.dept = cap.department
    else delete document.documentElement.dataset.dept
  }, [cap.department])

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand-home" onClick={() => activeItem && onNavigate(items[0].id)} title="Home" aria-label="Home">
          <img className="brand-logo" src="/mania-logo-white.png" alt="Mania Cards & Collectibles" />
        </button>
        <div className="spacer" />
        <div className="who">
          {profile?.name} · {ROLE_LABEL[cap.role] || cap.role}{cap.department ? ` · ${cap.department}` : ''}
        </div>
        <button className="icon-btn" title="Toggle light / dark" aria-label="Toggle theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={onSignOut}><LogoutIcon /></button>
      </header>

      <nav className="tabs">
        {groups.map((g) => (
          <button key={g} className={'tab' + (activeGroup === g ? ' active' : '')}
            onClick={() => { const first = items.find((i) => i.group === g); if (first) onNavigate(first.id) }}>
            {g}
          </button>
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
    </div>
  )
}

export { NAV }
