import { useEffect, useState } from 'react'

/**
 * Tells everyone when they're running old code.
 *
 * You deploy several times a day. A streamer who opened the app on Tuesday is
 * still running Tuesday's bundle — and on a stock system, old code means wrong
 * numbers, missing columns, and RPC calls that no longer match the database.
 * They won't think to refresh, because nothing looks broken.
 *
 * So the app checks /version.json against the build id compiled into it. When
 * they differ, a new version is live and this asks them to reload.
 *
 * Checks on load, every 5 minutes, and whenever the app is brought back into
 * focus — which on a phone is the moment they return to it, exactly when you
 * want them current.
 */
const CHECK_EVERY = 5 * 60 * 1000

export default function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let dead = false

    async function check() {
      if (dead || stale) return
      try {
        // Cache-bust, or the browser will happily hand back the old file.
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { build } = await res.json()
        if (build && build !== __BUILD_ID__) setStale(true)
      } catch {
        // Offline or mid-deploy. Not worth bothering anyone about.
      }
    }

    check()
    const timer = setInterval(check, CHECK_EVERY)
    const onFocus = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)

    return () => {
      dead = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [stale])

  if (!stale) return null

  // A blocking modal, not a banner. Old code on a stock system means wrong
  // numbers and RPC calls that no longer match the database — so this is one of
  // the few times it's right to stop someone rather than nudge them.
  // There is deliberately no close button and no click-away.
  return (
    <div className="modal-back update-modal" role="alertdialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
        <div className="update-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </div>

        <h2 style={{ margin: '12px 0 6px', fontSize: 20 }}>A new version is ready</h2>

        <p className="note" style={{ marginBottom: 18 }}>
          The app has been updated. Reload to carry on — until you do, your
          figures may be out of date.
        </p>

        <button className="btn" style={{ width: '100%' }} onClick={() => window.location.reload()}>
          Reload now
        </button>
      </div>
    </div>
  )
}
