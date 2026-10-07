import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { PLANS, todayISO, fmtDate, fmtDateLong, summarize, status, exportText } from './logic'

const INSTRUMENTS = ['Piano', 'Guitar', 'Drums', 'Violin', 'Vocals', 'Bass', 'Ukulele', 'Saxophone']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [isManager, setIsManager] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setIsManager(null)
    supabase.rpc('is_manager').then(({ data }) => setIsManager(!!data))
  }, [session])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  if (isManager === null) return <Splash />
  if (!isManager)
    return (
      <div className="center">
        <div className="card narrow">
          <h2>No access</h2>
          <p className="muted">{session.user.email} isn't set up as a manager.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  return <Tracker />
}

function Splash() {
  return <div className="center"><div className="logo big">JazzUp<span>Tracker</span></div></div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr('Wrong email or password.')
    setBusy(false)
  }
  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <div className="logo big">JazzUp<span>Tracker</span></div>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

/* ---------------- main tracker ---------------- */

function Tracker() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    const [st, pk, py, ls] = await Promise.all([
      supabase.from('students').select('*'),
      supabase.from('packages').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('lessons').select('*'),
    ])
    const err = st.error || pk.error || py.error || ls.error
    if (err) return setError(err.message)
    setError('')
    setData({ students: st.data, packages: pk.data, payments: py.data, lessons: ls.data })
  }, [])

  useEffect(() => {
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const sMap = Object.fromEntries(data.students.map((s) => [s.id, s]))
    return data.packages.map((p) => {
      const payments = data.payments.filter((x) => x.package_id === p.id)
      const lessons = data.lessons.filter((x) => x.package_id === p.id)
      const sum = summarize(payments, lessons)
      return { pkg: p, student: sMap[p.student_id], payments, lessons, sum, st: status(sum.balance, payments.length > 0) }
    })
  }, [data])

  const rank = { red: 0, amber: 1, ok: 2 }
  const visible = rows
    .filter((r) => r.student && r.pkg.archived === showArchived)
    .filter((r) => !q || `${r.student.name} ${r.pkg.instrument}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank[a.st] - rank[b.st] || a.sum.balance - b.sum.balance || a.student.name.localeCompare(b.student.name))

  const counts = rows.filter((r) => !r.pkg.archived).reduce((c, r) => ({ ...c, [r.st]: (c[r.st] || 0) + 1 }), {})
  const open = rows.find((r) => r.pkg.id === openId)

  if (open) return <PackageView row={open} students={data.students} onBack={() => setOpenId(null)} reload={load} />

  return (
    <div className="page">
      <header className="top">
        <div className="logo">JazzUp<span>Tracker</span></div>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      {error && <p className="error">{error}</p>}

      {data && (
        <div className="summary">
          <div className="pill red"><b>{counts.red || 0}</b> need payment</div>
          <div className="pill amber"><b>{counts.amber || 0}</b> 1 lesson left</div>
          <div className="pill ok"><b>{counts.ok || 0}</b> all good</div>
        </div>
      )}

      <div className="toolbar">
        <input className="search" placeholder="Search student or instrument" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setAdding(true)}>+ Student</button>
      </div>

      {!data ? <p className="muted pad">Loading…</p> : visible.length === 0 ? (
        <div className="empty">
          {showArchived ? 'No archived students.' : rows.length ? 'No matches.' : 'No students yet. Tap “+ Student” to add the first one.'}
        </div>
      ) : (
        <ul className="list">
          {visible.map((r) => (
            <li key={r.pkg.id}>
              <button className={`row ${r.st}`} onClick={() => setOpenId(r.pkg.id)}>
                <div className="row-main">
                  <div className="name">{r.student.name}</div>
                  <div className="sub">{r.pkg.instrument}{r.lessons.length ? ` · last lesson ${fmtDate(lastLesson(r.lessons))}` : ''}</div>
                </div>
                <Balance sum={r.sum} hasPayments={r.payments.length > 0} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="link center-link" onClick={() => setShowArchived(!showArchived)}>
        {showArchived ? '← Back to active students' : 'Show archived'}
      </button>

      {adding && <AddStudent students={data?.students || []} onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); load().then(() => setOpenId(id)) }} />}
    </div>
  )
}

const lastLesson = (lessons) => lessons.reduce((m, l) => (l.lesson_date > m ? l.lesson_date : m), '')

function Balance({ sum, hasPayments }) {
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

function AddStudent({ students, onClose, onDone, presetStudent }) {
  const [mode, setMode] = useState(presetStudent ? 'existing' : 'new')
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState(presetStudent?.id || '')
  const [instrument, setInstrument] = useState('Piano')
  const [other, setOther] = useState('')
  const [plan, setPlan] = useState(4)
  const [paidOn, setPaidOn] = useState(todayISO())
  const [withPayment, setWithPayment] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async (e) => {
    e.preventDefault()
    const inst = instrument === 'Other' ? other.trim() : instrument
    if (!inst) return setErr('Enter the instrument.')
    setBusy(true); setErr('')
    let sid = studentId
    if (mode === 'new') {
      const { data, error } = await supabase.from('students').insert({ name: name.trim() }).select().single()
      if (error) { setBusy(false); return setErr(error.message) }
      sid = data.id
    }
    const { data: pkg, error: e2 } = await supabase.from('packages').insert({ student_id: sid, instrument: inst }).select().single()
    if (e2) { setBusy(false); return setErr(e2.message) }
    if (withPayment) {
      const { error: e3 } = await supabase.from('payments').insert({ package_id: pkg.id, plan_lessons: plan, paid_on: paidOn })
      if (e3) { setBusy(false); return setErr(e3.message) }
    }
    onDone(pkg.id)
  }

  return (
    <Sheet title={presetStudent ? `Add instrument for ${presetStudent.name}` : 'Add student'} onClose={onClose}>
      <form onSubmit={save}>
        {!presetStudent && students.length > 0 && (
          <div className="seg">
            <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New student</button>
            <button type="button" className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>Existing student</button>
          </div>
        )}
        {mode === 'new' ? (
          <label>Student name<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        ) : !presetStudent && (
          <label>Student
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Choose…</option>
              {[...students].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label>Instrument
          <select value={instrument} onChange={(e) => setInstrument(e.target.value)}>
            {INSTRUMENTS.map((i) => <option key={i}>{i}</option>)}
            <option>Other</option>
          </select>
        </label>
        {instrument === 'Other' && <label>Which instrument?<input value={other} onChange={(e) => setOther(e.target.value)} required /></label>}

        <label className="check"><input type="checkbox" checked={withPayment} onChange={(e) => setWithPayment(e.target.checked)} /> Record first payment now</label>
        {withPayment && <PlanPicker plan={plan} setPlan={setPlan} paidOn={paidOn} setPaidOn={setPaidOn} />}

        {err && <p className="error">{err}</p>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Sheet>
  )
}

function PlanPicker({ plan, setPlan, paidOn, setPaidOn }) {
  return (
    <>
      <div className="field-label">Plan</div>
      <div className="seg">
        {PLANS.map((p) => (
          <button type="button" key={p} className={plan === p ? 'on' : ''} onClick={() => setPlan(p)}>
            {p} {p === 1 ? 'lesson' : 'lessons'}
          </button>
        ))}
      </div>
      <DateField label="Payment date" value={paidOn} onChange={setPaidOn} />
    </>
  )
}

/* ---------------- package detail ---------------- */

function PackageView({ row, students, onBack, reload }) {
  const { pkg, student, payments, lessons, sum } = row
  const [sheet, setSheet] = useState(null) // 'lesson' | 'payment' | 'export' | 'edit' | 'instrument'
  const [toast, setToast] = useState('')
  const [lessonDate, setLessonDate] = useState(todayISO())
  const [plan, setPlan] = useState(4)
  const [paidOn, setPaidOn] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }
  const openSheet = (name) => {
    if (name === 'lesson') setLessonDate(todayISO())
    if (name === 'payment') setPaidOn(todayISO())
    setSheet(name)
  }

  const logLesson = async (date) => {
    setBusy(true)
    const { error } = await supabase.from('lessons').insert({ package_id: pkg.id, lesson_date: date })
    setBusy(false)
    if (error) return flash(error.message)
    setSheet(null); setLessonDate(todayISO())
    await reload()
    flash(`Lesson logged · ${fmtDate(date)}`)
  }

  const addPayment = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('payments').insert({ package_id: pkg.id, plan_lessons: plan, paid_on: paidOn })
    setBusy(false)
    if (error) return flash(error.message)
    setSheet(null); setPaidOn(todayISO())
    await reload()
    flash(`Payment added · ${plan} ${plan === 1 ? 'lesson' : 'lessons'}`)
  }

  const del = async (table, id, what) => {
    if (!confirm(`Delete this ${what}?`)) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return flash(error.message)
    await reload(); flash(`${what[0].toUpperCase() + what.slice(1)} deleted`)
  }

  // history, newest first, grouped by payment
  const groups = [...sum.buckets].reverse()
  const loggedToday = lessons.some((l) => l.lesson_date === todayISO())
  const st = status(sum.balance, payments.length > 0)

  return (
    <div className="page">
      <header className="top">
        <button className="link" onClick={onBack}>← All students</button>
        <button className="link" onClick={() => setSheet('edit')}>Edit</button>
      </header>

      <section className={`hero ${st}`}>
        <div>
          <h1>{student.name}</h1>
          <div className="sub">{pkg.instrument}{pkg.archived ? ' · archived' : ''}</div>
        </div>
        <Balance sum={sum} hasPayments={payments.length > 0} />
      </section>

      <div className="actions">
        <button className="btn primary big" disabled={busy} onClick={() => (loggedToday ? openSheet('lesson') : logLesson(todayISO()))}>
          ✓ Lesson today
        </button>
        <button className="btn" onClick={() => openSheet('lesson')}>Other date</button>
      </div>
      {loggedToday && <p className="muted small center-text">A lesson is already logged for today — pick a date to add another.</p>}
      <div className="actions two">
        <button className="btn" onClick={() => openSheet('payment')}>+ Payment</button>
        <button className="btn" onClick={() => setSheet('export')}>Send to parent</button>
      </div>

      <h3 className="section">History</h3>
      {sum.owed.length > 0 && (
        <div className="group owed">
          <div className="group-head"><b>Not paid yet</b><span>{sum.owed.length} owed</span></div>
          {[...sum.owed].reverse().map((l) => <LessonItem key={l.id} l={l} onDelete={() => del('lessons', l.id, 'lesson')} />)}
        </div>
      )}
      {groups.length === 0 && sum.owed.length === 0 && <p className="muted">No payments or lessons yet.</p>}
      {groups.map((g) => (
        <div className="group" key={g.payment.id}>
          <div className="group-head">
            <b>{g.payment.plan_lessons}-lesson plan · paid {fmtDateLong(g.payment.paid_on)}</b>
            <span>{g.lessons.length}/{g.payment.plan_lessons}</span>
            <button className="x" title="Delete payment" onClick={() => del('payments', g.payment.id, 'payment')}>×</button>
          </div>
          <Dots used={g.lessons.length} total={g.payment.plan_lessons} />
          {[...g.lessons].reverse().map((l) => <LessonItem key={l.id} l={l} onDelete={() => del('lessons', l.id, 'lesson')} />)}
        </div>
      ))}

      {sheet === 'lesson' && (
        <Sheet title="Log a lesson" onClose={() => setSheet(null)}>
          <form onSubmit={(e) => { e.preventDefault(); logLesson(lessonDate) }}>
            <DateField label="Lesson date" value={lessonDate} onChange={setLessonDate} />
            <button className="btn primary full" disabled={busy}>Log lesson</button>
          </form>
        </Sheet>
      )}
      {sheet === 'payment' && (
        <Sheet title="Add payment" onClose={() => setSheet(null)}>
          <form onSubmit={addPayment}>
            <PlanPicker plan={plan} setPlan={setPlan} paidOn={paidOn} setPaidOn={setPaidOn} />
            {sum.balance < 0 && <p className="muted small">{-sum.balance} owed {sum.balance === -1 ? 'lesson' : 'lessons'} will be covered by this payment first.</p>}
            <button className="btn primary full" disabled={busy}>Save payment</button>
          </form>
        </Sheet>
      )}
      {sheet === 'export' && <ExportSheet student={student} pkg={pkg} payments={payments} lessons={lessons} onClose={() => setSheet(null)} flash={flash} />}
      {sheet === 'edit' && <EditSheet student={student} pkg={pkg} onClose={() => setSheet(null)} reload={reload} onDeleted={onBack} onAddInstrument={() => setSheet('instrument')} />}
      {sheet === 'instrument' && <AddStudent students={students} presetStudent={student} onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload(); flash('Instrument added — find it on the main list') }} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Dots({ used, total }) {
  return <div className="dots">{Array.from({ length: total }, (_, i) => <span key={i} className={i < used ? 'on' : ''} />)}</div>
}

function LessonItem({ l, onDelete }) {
  return (
    <div className="lesson">
      <span>♪ {fmtDateLong(l.lesson_date)}</span>
      <button className="x" title="Delete lesson" onClick={onDelete}>×</button>
    </div>
  )
}

function ExportSheet({ student, pkg, payments, lessons, onClose, flash }) {
  const [text, setText] = useState(() => exportText(student.name, pkg.instrument, payments, lessons))
  const enc = encodeURIComponent(text)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); flash('Copied — paste it in the chat') }
    catch { flash('Could not copy — select the text and copy manually') }
  }
  const share = async () => {
    try { await navigator.share({ text }) } catch { /* cancelled */ }
  }
  return (
    <Sheet title="Message for parent" onClose={onClose}>
      <p className="muted small">You can edit the text before sending.</p>
      <textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="share">
        <a className="btn line" href={`https://line.me/R/share?text=${enc}`} target="_blank" rel="noreferrer">LINE</a>
        <a className="btn wa" href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <button className="btn" onClick={copy}>Copy</button>
        {typeof navigator !== 'undefined' && navigator.share && <button className="btn" onClick={share}>Share…</button>}
      </div>
    </Sheet>
  )
}

function EditSheet({ student, pkg, onClose, reload, onDeleted, onAddInstrument }) {
  const [name, setName] = useState(student.name)
  const [instrument, setInstrument] = useState(pkg.instrument)
  const [err, setErr] = useState('')

  const save = async (e) => {
    e.preventDefault()
    const r1 = await supabase.from('students').update({ name: name.trim() }).eq('id', student.id)
    const r2 = await supabase.from('packages').update({ instrument: instrument.trim() }).eq('id', pkg.id)
    if (r1.error || r2.error) return setErr((r1.error || r2.error).message)
    await reload(); onClose()
  }
  const toggleArchive = async () => {
    await supabase.from('packages').update({ archived: !pkg.archived }).eq('id', pkg.id)
    await reload(); onClose()
  }
  const remove = async () => {
    if (!confirm(`Permanently delete ${student.name}'s ${pkg.instrument} record, with all its lessons and payments?`)) return
    await supabase.from('packages').delete().eq('id', pkg.id)
    const { count } = await supabase.from('packages').select('id', { count: 'exact', head: true }).eq('student_id', student.id)
    if (count === 0) await supabase.from('students').delete().eq('id', student.id)
    await reload(); onDeleted()
  }

  return (
    <Sheet title="Edit" onClose={onClose}>
      <form onSubmit={save}>
        <label>Student name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Instrument<input value={instrument} onChange={(e) => setInstrument(e.target.value)} required /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary full">Save changes</button>
      </form>
      <hr />
      <button className="btn full" onClick={onAddInstrument}>+ Add another instrument for {student.name.split(' ')[0]}</button>
      <button className="btn full" onClick={toggleArchive}>{pkg.archived ? 'Restore from archive' : 'Archive (stopped lessons)'}</button>
      <button className="btn danger full" onClick={remove}>Delete permanently</button>
    </Sheet>
  )
}

function Sheet({ title, onClose, children }) {
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

// Shows the date as dd/mm/yy; tapping opens the phone's native calendar.
function DateField({ label, value, onChange }) {
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
