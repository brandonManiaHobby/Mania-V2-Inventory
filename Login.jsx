import { useState } from 'react'
import { useAuth } from './AuthProvider'

// Sign-in styled to match V1 — Mania logo + brand orange. Same Supabase as V1.
export default function Login() {
  const { signInWithEmail, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    if (!email || !password) return
    setBusy(true)
    await signInWithEmail(email.trim(), password)
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img className="auth-logo auth-logo-light" src="/mania-logo-dark.png" alt="Mania Cards &amp; Collectibles" />
        <img className="auth-logo auth-logo-dark" src="/mania-logo-white.png" alt="Mania Cards &amp; Collectibles" />
        <div className="auth-sub">Sign in</div>

        {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} autoCapitalize="none" placeholder="you@maniahobby.com"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        </div>

        <button className="btn" style={{ width: '100%' }} onClick={go} disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="center">
          <div className="note">Same login as V1 — reads the same database. Forgotten your password? Ask a manager to reset it.</div>
        </div>
      </div>
    </div>
  )
}
