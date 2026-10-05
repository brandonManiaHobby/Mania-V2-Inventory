import { useState } from 'react'
import { useAuth } from './AuthProvider'

// Minimal sign-in (email + password) against the same Supabase as V1.
export default function Login() {
  const { signInWithEmail, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    await signInWithEmail(email.trim(), password)
    setBusy(false)
  }

  const field = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', width: '100%', font: 'inherit', marginTop: 6 }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Mania V2</h1>
      <p style={{ color: '#666', marginTop: 4 }}>Sign in</p>
      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 13, color: '#444' }}>Email
          <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()} />
        </label>
        <label style={{ fontSize: 13, color: '#444', display: 'block', marginTop: 12 }}>Password
          <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()} />
        </label>
        {error && <div style={{ color: '#c82828', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <button onClick={go} disabled={busy || !email || !password}
          style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: '#1a7f37', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p style={{ color: '#999', fontSize: 12, marginTop: 16 }}>Same login as V1 — reads the same database.</p>
    </div>
  )
}
