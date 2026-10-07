import { useEffect, useState } from 'react'
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
      <h1 className="page-title">Team</h1>
      <h3 className="section">Teachers</h3>
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
      <Managers flash={flash} />

      {sheet?.type === 'creds' && <Credentials {...sheet} kind="teacher" onClose={() => setSheet(null)} flash={flash} />}
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

function Credentials({ name, email, password, isNew, kind = 'teacher', onClose, flash }) {
  const first = (name || '').trim().split(' ')[0]
  const url = window.location.origin
  const text = kind === 'manager' && isNew
    ? `Hi${first ? ' ' + first : ''}! 🎵

Your JazzUp Lesson Tracker is ready — every student's lessons and payments in one place.

${url}
Email: ${email}
Password: ${password}

✅ Tap "Lesson today" after each lesson
🔴 Red = time to pay · 🟠 Orange = 1 lesson left
💬 "Send to parent" writes a LINE message with all the lesson dates
👩‍🏫 Add your teachers so they can log their own lessons

Tip: open the link on your phone and choose "Add to Home Screen" — it'll sit there with the JazzUp logo.

Enjoy! 🎶`
    : `Hi${first ? ' ' + first : ''}! ${isNew ? "Here's your login for the JazzUp Lesson Tracker" : 'Your new JazzUp Lesson Tracker password'} 🎵

${url}
Email: ${email}
Password: ${password}
${isNew ? '\nTip: open the link on your phone and choose "Add to Home Screen".' : ''}`
  const enc = encodeURIComponent(text)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); flash('Copied') } catch { flash('Could not copy — select the text manually') }
  }
  return (
    <Sheet title={isNew ? (kind === 'manager' ? 'Invite ready 🎉' : 'Login created') : 'New password'} onClose={onClose}>
      <div className="creds">
        <div><small>Email</small><b>{email}</b></div>
        <div><small>Password</small><b className="mono">{password}</b></div>
      </div>
      <p className="muted small">Send this to {first || 'them'} now — the password won't be shown again. You can always make a new one.</p>
      <textarea rows={kind === 'manager' && isNew ? 12 : 8} readOnly value={text} />
      <div className="share">
        <a className="btn line" href={`https://line.me/R/share?text=${enc}`} target="_blank" rel="noreferrer">LINE</a>
        <a className="btn wa" href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <button className="btn" onClick={copy}>Copy</button>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  )
}

/* ---------------- managers ---------------- */

function Managers({ flash }) {
  const [list, setList] = useState(null)
  const [me, setMe] = useState('')
  const [sheet, setSheet] = useState(null) // { type: 'invite' } | { type: 'manage', email } | { type: 'creds', ... }

  const load = async () => {
    const res = await callLogin({ action: 'list_managers' })
    setList(res.error ? [] : res.managers)
  }
  useEffect(() => {
    load()
    supabase.auth.getSession().then(({ data }) => setMe((data.session?.user?.email || '').toLowerCase()))
  }, [])

  return (
    <>
      <h3 className="section">Managers</h3>
      <p className="muted small">Managers see everything: all students, payments and teachers.</p>
      {list === null ? <p className="muted small">Loading…</p> : (
        <ul className="list">
          {list.map((email) => (
            <li key={email}>
              <button className="row teacher-row" onClick={() => email !== me && setSheet({ type: 'manage', email })} disabled={email === me}>
                <div className="row-main">
                  <div className="name">{email}</div>
                  <div className="sub">{email === me ? 'You' : 'Manager'}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn full" style={{ marginTop: 10 }} onClick={() => setSheet({ type: 'invite' })}>+ Invite a manager</button>

      {sheet?.type === 'invite' && <InviteManager onClose={() => setSheet(null)} onDone={(res) => { load(); setSheet({ type: 'creds', ...res }) }} />}
      {sheet?.type === 'manage' && <ManageManager email={sheet.email} onClose={() => setSheet(null)}
        onDone={(res) => { load(); if (res.password) setSheet({ type: 'creds', ...res }); else { setSheet(null); flash(res.msg) } }} />}
      {sheet?.type === 'creds' && <Credentials {...sheet} kind="manager" onClose={() => setSheet(null)} flash={flash} />}
    </>
  )
}

function InviteManager({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const res = await callLogin({ action: 'add_manager', email })
    setBusy(false)
    if (res.error) return setErr(res.error)
    onDone({ name, email: res.email, password: res.password, isNew: true })
  }
  return (
    <Sheet title="Invite a manager" onClose={onClose}>
      <form onSubmit={save}>
        <label>Their name <span className="opt">(for the greeting)</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <p className="muted small">A login is created right away and you'll get a ready-to-send LINE/WhatsApp invite.</p>
        {err && <p className="error">{err}</p>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Creating…' : 'Create invite'}</button>
      </form>
    </Sheet>
  )
}

function ManageManager({ email, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const reset = async () => {
    setBusy(true); setErr('')
    const res = await callLogin({ action: 'reset_manager', email })
    setBusy(false)
    if (res.error) return setErr(res.error)
    onDone({ email: res.email, password: res.password, isNew: false })
  }
  const remove = async () => {
    if (!confirm(`Remove ${email} as a manager? Their login will stop working.`)) return
    setBusy(true); setErr('')
    const res = await callLogin({ action: 'remove_manager', email })
    setBusy(false)
    if (res.error) return setErr(res.error)
    onDone({ msg: 'Manager removed' })
  }
  return (
    <Sheet title={email} onClose={onClose}>
      {err && <p className="error">{err}</p>}
      <button className="btn full" disabled={busy} onClick={reset}>New password</button>
      <button className="btn danger full" disabled={busy} onClick={remove}>Remove manager</button>
    </Sheet>
  )
}
