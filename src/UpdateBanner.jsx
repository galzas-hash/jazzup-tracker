import { useEffect, useState } from 'react'

/* global __BUILD_ID__ */
// Shows a bar when a newer version of the app has been published.
export default function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { build } = await res.json()
        if (!stopped && build && build !== __BUILD_ID__) setReady(true)
      } catch { /* offline — try again later */ }
    }
    const first = setTimeout(check, 3000)
    const timer = setInterval(check, 5 * 60 * 1000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (!ready) return null
  return (
    <div className="update-bar">
      <span>✨ A new version of JazzUp is ready</span>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  )
}
