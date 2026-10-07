import { useState } from 'react'
import { supabase } from './supabase'
import { Sheet, useToast } from './ui'

// Dropdown used when adding/editing a student's instrument
export function TeacherSelect({ teachers, value, onChange }) {
  if (!teachers.length) return null
  return (
    <label>Teacher
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— No teacher —</option>
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  )
}

async function callLogin(body) {
  const { data, error } = await supabase.functions.invoke('teacher-login', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* keep default */ }
    return { error: msg }
  }
  return data
}

export default function Teachers({ teachers, packages, onBack, reload }) {
  const [sheet, setSheet] = useState(null) // { type: 'add' } | { type: 'edit', t } | { type: 'creds', ... }
  const { flash, toastNode } = useToast(reload)
  const count = (id) => packages.filter((p) => p.teacher_id === id && !p.archived).length
  const active = teachers.filter((t) => t.active)
  const inactive = teachers.filter((t) => !t.active)

  const Row = ({ t }) => (
    <li>
      <button className="row teacher-row" onClick={() => setSheet({ type: 'edit', t })}>
        <div className="row-main">
          <div className="name">{t.name}</div>
          <div className="sub">{t.user_id ? `Login: ${t.email}` : 'No login yet'}</div>
        </div>
        <div className="tcount"><b>{count(t.id)}</b><small>{count(t.id) === 1 ? 'student' : 'students'}</small></div>
      </button>
    </li>
  )

  return (
    <div className="page">
      <header className="top">
        <button className="link" onClick={onBack}>← All students</button>
      </header>
      <h1 className="page-title">Teachers</h1>
      <p className="muted small">Teachers with a login can open the app, see only their own students, and log lessons. They can't see or add payments.</p>

      <button className="btn primary full" onClick={() => setSheet({ type: 'add' })}>+ Add teacher</button>

      {teachers.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>No teachers yet.</div>
      ) : (
        <ul className="list" style={{ marginTop: 14 }}>{active.map((t) => <Row key={t.id} t={t} />)}</ul>
      )}
      {inactive.length > 0 && (
        <>
          <h3 className="section">Inactive</h3>
          <ul className="list dim">{inactive.map((t) => <Row key={t.id} t={t} />)}</ul>
        </>
      )}

      {sheet?.type === 'add' && (
        <TeacherForm onClose={() => { setSheet(null); reload() }} onSaved={async (res) => {
          await reload()
          if (res.password) setSheet({ type: 'creds', ...res })
          else { setSheet(null); flash('Teacher added') }
        }} />
      )}
      {sheet?.type === 'edit' && (
        <TeacherForm teacher={sheet.t} studentCount={count(sheet.t.id)} onClose={() => setSheet(null)}
          onSaved={async (res) => {
            await reload()
            if (res.password) setSheet({ type: 'creds', ...res })
            else { setSheet(null); flash(res.msg || 'Saved') }
          }} />
      )}
      {sheet?.type === 'creds' && <Credentials {...sheet} onClose={() => setSheet(null)} flash={flash} />}
      {toastNode}
    </div>
  )
}

function TeacherForm({ teacher, studentCount = 0, onClose, onSaved }) {
  const [name, setName] = useState(teacher?.name || '')
  const [email, setEmail] = useState(teacher?.email || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hasLogin = !!teacher?.user_id

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    let t = teacher
    if (!t) {
      const { data, error } = await supabase.from('teachers').insert({ name: name.trim() }).select().single()
      if (error) { setBusy(false); return setErr(error.message) }
      t = data
    } else if (name.trim() !== teacher.name) {
      const { error } = await supabase.from('teachers').update({ name: name.trim() }).eq('id', t.id)
      if (error) { setBusy(false); return setErr(error.message) }
    }
    const newEmail = email.trim().toLowerCase()
    // Create a login if an email was entered and it's new or changed
    if (newEmail && newEmail !== (teacher?.email || '')) {
      const res = await callLogin({ action: 'set_login', teacher_id: t.id, email: newEmail })
      setBusy(false)
      if (res.error) return setErr(teacher ? res.error : `${res.error} ${t.name} was added without a login — close this and tap their name to try again.`)
      return onSaved({ name: t.name || name.trim(), email: res.email, password: res.password, isNew: !hasLogin })
    }
    setBusy(false)
    onSaved({ msg: teacher ? 'Saved' : 'Teacher added' })
  }

  const resetPassword = async () => {
    setBusy(true); setErr('')
    const res = await callLogin({ action: 'set_login', teacher_id: teacher.id, email: teacher.email })
    setBusy(false)
    if (res.error) return setErr(res.error)
    onSaved({ name: teacher.name, email: res.email, password: res.password, isNew: false })
  }
  const removeLogin = async () => {
    if (!confirm(`Remove ${teacher.name}'s login? They won't be able to open the app.`)) return
    setBusy(true)
    const res = await callLogin({ action: 'remove_login', teacher_id: teacher.id })
    setBusy(false)
    if (res.error) return setErr(res.error)
    onSaved({ msg: 'Login removed' })
  }
  const toggleActive = async () => {
    setBusy(true)
    const { error } = await supabase.from('teachers').update({ active: !teacher.active }).eq('id', teacher.id)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved({ msg: teacher.active ? `${teacher.name} marked inactive` : `${teacher.name} is active again` })
  }
  const remove = async () => {
    const extra = studentCount ? ` Their ${studentCount} student${studentCount === 1 ? '' : 's'} will be left without a teacher.` : ''
    if (!confirm(`Delete ${teacher.name}?${extra} Lesson history stays.`)) return
    setBusy(true)
    if (teacher.user_id) await callLogin({ action: 'remove_login', teacher_id: teacher.id })
    const { error } = await supabase.from('teachers').delete().eq('id', teacher.id)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved({ msg: 'Teacher deleted' })
  }

  return (
    <Sheet title={teacher ? teacher.name : 'Add teacher'} onClose={onClose}>
      <form onSubmit={save}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!teacher} /></label>
        <label>Email for login <span className="opt">(optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Leave empty if they won't use the app" />
        </label>
        {!hasLogin && email.trim() && <p className="muted small">A password will be created for them — you'll see it on the next screen.</p>}
        {hasLogin && email.trim().toLowerCase() !== teacher.email && email.trim() && <p className="muted small">Changing the email creates a new login and a new password.</p>}
        {err && <p className="error">{err}</p>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
      {teacher && (
        <>
          <hr />
          {hasLogin && <button className="btn full" disabled={busy} onClick={resetPassword}>New password</button>}
          {hasLogin && <button className="btn full" disabled={busy} onClick={removeLogin}>Remove login</button>}
          <button className="btn full" disabled={busy} onClick={toggleActive}>{teacher.active ? 'Mark inactive (left the school)' : 'Make active again'}</button>
          <button className="btn danger full" disabled={busy} onClick={remove}>Delete teacher</button>
        </>
      )}
    </Sheet>
  )
}

function Credentials({ name, email, password, isNew, onClose, flash }) {
  const first = name.split(' ')[0]
  const text = `Hi ${first}! ${isNew ? "Here's your login for the JazzUp Lesson Tracker" : 'Your new JazzUp Lesson Tracker password'} 🎵

${window.location.origin}
Email: ${email}
Password: ${password}

Tip: open the link on your phone and choose "Add to Home Screen".`
  const enc = encodeURIComponent(text)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); flash('Copied') } catch { flash('Could not copy — select the text manually') }
  }
  return (
    <Sheet title={isNew ? 'Login created' : 'New password'} onClose={onClose}>
      <div className="creds">
        <div><small>Email</small><b>{email}</b></div>
        <div><small>Password</small><b className="mono">{password}</b></div>
      </div>
      <p className="muted small">Send this to {first} now — the password won't be shown again. You can always make a new one.</p>
      <textarea rows={8} readOnly value={text} />
      <div className="share">
        <a className="btn line" href={`https://line.me/R/share?text=${enc}`} target="_blank" rel="noreferrer">LINE</a>
        <a className="btn wa" href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <button className="btn" onClick={copy}>Copy</button>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  )
}
