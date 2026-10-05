import { useState } from 'react'
import { useAuth, Login } from './auth'
import { useSource, int } from './data'
import { scopeSource } from './scoping'
import NavShell from './components/NavShell'
import { Dashboard, RecordStream } from './screens'

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
  const [active, setActive] = useState('dashboard')

  if (authStatus === 'checking') return <Centered>Checking session…</Centered>
  if (authStatus === 'signedOut') return <Login />
  if (authStatus === 'noProfile') return <Centered>Signed in, but no profile found for this account. An admin needs to set up your profile.</Centered>

  // Logged in with a profile -> scoped live data flows.
  const scoped = scopeSource(source, profile)

  return (
    <NavShell profile={profile} active={active} onNavigate={setActive} onSignOut={signOut}>
      {srcStatus !== 'ready' ? (
        <p>Loading…</p>
      ) : active === 'dashboard' ? (
        <Dashboard scoped={scoped} />
      ) : active === 'record' ? (
        <RecordStream scoped={scoped} />
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>{PLACEHOLDER[active] || active}</h2>
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
