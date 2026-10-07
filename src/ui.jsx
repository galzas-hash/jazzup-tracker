import { useEffect, useRef, useState } from 'react'
import { fmtDate, fmtDateLong, status } from './logic'

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>{title}</h2><button className="x big" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  )
}

export function DateField({ label, value, onChange }) {
  const open = (e) => { try { e.currentTarget.showPicker?.() } catch { /* not supported */ } }
  return (
    <label>{label}
      <div className="datefield">
        <span>{fmtDate(value)}</span>
        <span className="cal" aria-hidden>📅</span>
        <input type="date" value={value} max="2099-12-31" onClick={open}
          onChange={(e) => e.target.value && onChange(e.target.value)} required aria-label={label} />
      </div>
    </label>
  )
}

export function Balance({ sum, hasPayments }) {
  if (!hasPayments && sum.used === 0) return <div className="bal red"><b>—</b><small>no payment</small></div>
  const b = sum.balance
  return (
    <div className={`bal ${status(b, hasPayments)}`}>
      <b>{b < 0 ? `−${-b}` : b}</b>
      <small>{b < 0 ? 'owed' : b === 1 ? 'lesson left' : 'lessons left'}</small>
    </div>
  )
}

/* ---------------- add student ---------------- */

export function Dots({ used, total }) {
  return <div className="dots">{Array.from({ length: total }, (_, i) => <span key={i} className={i < used ? 'on' : ''} />)}</div>
}

export function LessonItem({ l, onEdit, by }) {
  return (
    <button className="lesson" onClick={onEdit}>
      <span>♪ {fmtDateLong(l.lesson_date)}{by && <small className="by"> · by {by}</small>}</span>
      <span className="pen" aria-hidden>✎</span>
    </button>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <img src="/mark.png" alt="" />
      <div><b>JAZZ UP!</b><small>Lesson Tracker</small></div>
    </div>
  )
}

// Small notification bar at the bottom, optionally with an Undo button.
export function useToast(reload) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = (msg, undo) => {
    clearTimeout(timer.current)
    setToast({ msg, undo })
    timer.current = setTimeout(() => setToast(null), undo ? 7000 : 2200)
  }
  const runUndo = async () => {
    const fn = toast?.undo
    setToast(null)
    if (!fn) return
    const { error } = await fn()
    if (error) return flash(error.message)
    await reload()
    flash('Undone')
  }
  const node = toast && (
    <div className="toast">
      <span>{toast.msg}</span>
      {toast.undo && <button className="undo" onClick={runUndo}>Undo</button>}
    </div>
  )
  return { flash, toastNode: node }
}

// Calendar for picking one or more lesson dates (used to log past lessons in one go).
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n) => String(n).padStart(2, '0')
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

export function MultiDatePicker({ taken = [], busy, onSave }) {
  const today = new Date()
  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate())
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [picked, setPicked] = useState([])
  const takenSet = new Set(taken)

  const first = new Date(ym.y, ym.m, 1)
  const offset = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const isCurrentMonth = ym.y === today.getFullYear() && ym.m === today.getMonth()

  const move = (delta) => setYm(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const toggle = (iso) => setPicked((p) => (p.includes(iso) ? p.filter((x) => x !== iso) : [...p, iso].sort()))

  return (
    <div className="mdp">
      <p className="muted small" style={{ marginTop: 0 }}>Tap every day the student had a lesson. You can move between months.</p>
      <div className="mdp-head">
        <button type="button" className="mdp-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b>{MONTH_NAMES[ym.m]} {ym.y}</b>
        <button type="button" className="mdp-nav" onClick={() => move(1)} disabled={isCurrentMonth} aria-label="Next month">›</button>
      </div>
      <div className="mdp-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="mdp-dow">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const iso = isoOf(ym.y, ym.m, d)
          const future = iso > todayIso
          const cls = ['mdp-day', picked.includes(iso) && 'on', takenSet.has(iso) && 'taken', iso === todayIso && 'today'].filter(Boolean).join(' ')
          return <button type="button" key={i} className={cls} disabled={future} onClick={() => toggle(iso)}>{d}</button>
        })}
      </div>
      <div className="mdp-legend"><span className="mdp-dot" /> already logged</div>
      {picked.length > 0 && (
        <div className="mdp-picked">
          {picked.map((iso) => (
            <button type="button" key={iso} className="mdp-chip" onClick={() => toggle(iso)}>{fmtDate(iso)} ×</button>
          ))}
        </div>
      )}
      <button className="btn primary full" disabled={busy || !picked.length} onClick={() => onSave(picked)}>
        {busy ? 'Saving…' : picked.length ? `Log ${picked.length} lesson${picked.length === 1 ? '' : 's'}` : 'Pick dates'}
      </button>
    </div>
  )
}
