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
