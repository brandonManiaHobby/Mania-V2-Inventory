import { useState } from 'react'
import { useAuth, Login } from './auth'
import { useSource, int } from './data'
import { scopeSource, capabilities } from './scoping'
import NavShell, { NAV } from './components/NavShell'
import { Dashboard, RecordStream, Streamers, Products, MyStock, Inventory, ToppsSurvey, MoveStock, Insights, PastStreams, Teams, Finance, Export, Distro, StockIntake, Admin, Consumables, StreamLogs, ReportBuilder, Operations } from './screens'

// ============================================================
// STAGE 4 — auth + nav shell.
// Not logged in -> Login. Logged in -> role-appropriate nav shell with
// placeholder screens (structure first). Live data now flows: the logged-
// in profile unlocks RLS, and the scoped source shows real counts.
// ============================================================
const PLACEHOLDER = {
  mystock: 'My Stock', record: 'Record stream', past: 'Past streams',
  dashboard: 'Dashboard', streamers: 'Streamers', products: 'Products',
  insights: 'Insights', inventory: 'Inventory', movestock: 'Move stock',
  vat: 'VAT report',
}

export default function App() {
  const { status: authStatus, profile, signOut } = useAuth()
  const { source, status: srcStatus } = useSource()
  const [active, setActive] = useState(null)
  // Admin "view as role" — preview the app as another role's layout.
  const [viewAs, setViewAs] = useState(null)

  if (authStatus === 'checking') return <Centered>Checking session…</Centered>
  if (authStatus === 'signedOut') return <Login />
  if (authStatus === 'noProfile') return <Centered>Signed in, but no profile found for this account. An admin needs to set up your profile.</Centered>

  const isAdmin = capabilities(profile).isAdmin
  const shownProfile = (viewAs && isAdmin) ? { ...profile, role: viewAs } : profile
  const scoped = scopeSource(source, shownProfile)

  // Landing page by role: dashboard for analytics roles (admin/manager/lead),
  // the streamer's own stats for streamers, else their first available screen.
  const cap = capabilities(shownProfile)
  const landing = cap.seesAnalytics ? 'dashboard' : (cap.hasOwnShelf ? 'mystock' : (NAV.find((n) => n.needs(cap))?.id || 'dashboard'))
  const current = active || landing

  const enterViewAs = (role) => {
    setViewAs(role)
    const cap = capabilities({ ...profile, role })
    const first = NAV.find((n) => n.needs(cap))
    setActive(first ? first.id : 'dashboard')
  }
  const exitViewAs = () => { setViewAs(null); setActive('admin') }

  return (
    <NavShell profile={shownProfile} active={current} onNavigate={setActive} onSignOut={signOut}
      viewAs={viewAs} onViewAs={isAdmin ? enterViewAs : undefined} onExitViewAs={exitViewAs}>
      {srcStatus !== 'ready' ? (
        <p>Loading…</p>
      ) : current === 'dashboard' ? (
        <Dashboard scoped={scoped} />
      ) : current === 'record' ? (
        <RecordStream scoped={scoped} />
      ) : current === 'past' ? (
        <PastStreams scoped={scoped} />
      ) : current === 'finance' ? (
        <Finance scoped={scoped} />
      ) : current === 'streamers' ? (
        <Streamers scoped={scoped} />
      ) : current === 'products' ? (
        <Products scoped={scoped} />
      ) : current === 'insights' ? (
        <Insights scoped={scoped} />
      ) : current === 'teams' ? (
        <Teams scoped={scoped} />
      ) : current === 'admin' ? (
        <Admin scoped={scoped} onViewAs={isAdmin ? enterViewAs : undefined} />
      ) : current === 'mystock' ? (
        <MyStock scoped={scoped} />
      ) : current === 'inventory' ? (
        <Inventory scoped={scoped} />
      ) : current === 'movestock' ? (
        <MoveStock scoped={scoped} />
      ) : current === 'intake' ? (
        <StockIntake scoped={scoped} />
      ) : current === 'distro' ? (
        <Distro scoped={scoped} />
      ) : current === 'consumables' ? (
        <Consumables scoped={scoped} />
      ) : current === 'export' ? (
        <Export scoped={scoped} />
      ) : current === 'streamlogs' ? (
        <StreamLogs scoped={scoped} />
      ) : current === 'reports' ? (
        <ReportBuilder scoped={scoped} />
      ) : current === 'operations' ? (
        <Operations profile={shownProfile} />
      ) : current === 'toppssurvey' ? (
        <ToppsSurvey scoped={scoped} />
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>{PLACEHOLDER[current] || current}</h2>
          <p style={{ color: '#666' }}>Stage 5 — not built yet. Dashboard is the first live screen.</p>
          <div style={{ marginTop: 16, padding: 14, border: '1px solid #eee', borderRadius: 10, maxWidth: 420 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Live scoped data (proving the stack)</div>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Streams in your scope', scoped.streams.length],
                  ['Holdings', scoped.holdings.length],
                  ['Stock items', scoped.stockItems.length],
                  ['Profiles', scoped.profiles.length],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ padding: '5px 0', color: '#555' }}>{k}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600 }}>{int(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </NavShell>
  )
}

function Centered({ children }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '100px auto', padding: 24, textAlign: 'center', color: '#555' }}>
      {children}
    </div>
  )
}
