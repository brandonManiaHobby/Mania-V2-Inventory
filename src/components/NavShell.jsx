import { capabilities } from '../scoping'

// ============================================================
// NAV SHELL — role-appropriate navigation (hardening #8).
// Menu built from capabilities() — the ONE source of role logic.
// Each role sees exactly their nav (per blueprint §2), nothing more.
// Screens are empty placeholders here — structure first (Stage 5 fills them).
// ============================================================

// The full nav map. Each item declares which capability flag gates it.
// Built once; the shell just filters by the user's caps.
const NAV = [
  { id: 'mystock',    label: 'My Stock',      group: 'Streaming',  needs: (c) => c.hasOwnShelf },
  { id: 'record',     label: 'Record stream', group: 'Streaming',  needs: (c) => c.canRecordStream },
  { id: 'past',       label: 'Past streams',  group: 'Streaming',  needs: (c) => c.canRecordStream },
  { id: 'dashboard',  label: 'Dashboard',     group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'streamers',  label: 'Streamers',     group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'products',   label: 'Products',      group: 'Analytics',  needs: (c) => c.seesAllDepartments }, // not lead — the V1 leak
  { id: 'insights',   label: 'Insights',      group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'teams',      label: 'Teams',         group: 'Analytics',  needs: (c) => c.seesAnalytics },
  { id: 'inventory',  label: 'Inventory',     group: 'Stock',      needs: (c) => c.seesInventory },
  { id: 'movestock',  label: 'Move stock',    group: 'Stock',      needs: (c) => c.canMoveStock },
  { id: 'finance',    label: 'Finance',       group: 'Finance',    needs: (c) => c.seesAllDepartments },
  { id: 'export',     label: 'Export',        group: 'Reporting',  needs: (c) => c.seesAnalytics }, // lead sees dept-scoped
  { id: 'toppssurvey',label: 'Topps survey',  group: 'Reporting',  needs: (c) => c.seesAllDepartments },
]

export default function NavShell({ profile, active, onNavigate, onSignOut, children }) {
  const cap = capabilities(profile)
  const items = NAV.filter((n) => n.needs(cap))
  const groups = [...new Set(items.map((i) => i.group))]

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav style={{ width: 210, borderRight: '1px solid #eee', padding: '18px 14px', background: '#faf9f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 18 }}>Mania V2</strong>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fde68a', color: '#7c5e00', fontWeight: 700 }}>S4</span>
        </div>
        <div style={{ fontSize: 12, color: '#888', margintop: 2, marginBottom: 16 }}>
          {profile?.name} · {cap.role}{cap.department ? ' · ' + cap.department : ''}
        </div>

        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#aaa', fontWeight: 700, marginBottom: 4 }}>{g}</div>
            {items.filter((i) => i.group === g).map((i) => (
              <button key={i.id} onClick={() => onNavigate(i.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', font: 'inherit', marginBottom: 2,
                  background: active === i.id ? '#fde68a' : 'transparent',
                  fontWeight: active === i.id ? 700 : 400 }}>
                {i.label}
              </button>
            ))}
          </div>
        ))}

        <button onClick={onSignOut}
          style={{ marginTop: 20, fontSize: 13, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}>
          Sign out
        </button>
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: 28 }}>
        {children}
      </main>
    </div>
  )
}

export { NAV }
