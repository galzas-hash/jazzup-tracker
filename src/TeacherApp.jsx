import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { todayISO, fmtDate, status } from './logic'
import { Sheet, DateField, MultiDatePicker, Balance, LessonItem, Brand, useToast } from './ui'
import { cacheGet, cacheSet, localOps } from './cache'

// What a teacher sees: only their own students, lessons left, and logging lessons.
export default function TeacherApp({ userId }) {
  const cacheKey = 'tdata:' + userId
  const [data, setData] = useState(() => cacheGet(cacheKey))
  const local = useMemo(() => localOps(setData), [])
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const [me, st, pk, ls, paid] = await Promise.all([
      supabase.from('teachers').select('name').maybeSingle(),
      supabase.from('students').select('*'),
      supabase.from('packages').select('*').eq('archived', false),
      supabase.from('lessons').select('*'),
      supabase.rpc('my_paid_lessons'),
    ])
    const err = me.error || st.error || pk.error || ls.error || paid.error
    if (err) return setError(err.message)
    setError('')
    setData({ me: me.data, students: st.data, packages: pk.data, lessons: ls.data, paid: paid.data })
  }, [])
  useEffect(() => { if (data) cacheSet(cacheKey, data) }, [data, cacheKey])

  useEffect(() => {
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const sMap = Object.fromEntries(data.students.map((s) => [s.id, s]))
    const paidMap = Object.fromEntries(data.paid.map((p) => [p.package_id, p.paid]))
    return data.packages
      .map((p) => {
        const lessons = data.lessons.filter((l) => l.package_id === p.id)
        const paid = paidMap[p.id] || 0
        const sum = { balance: paid - lessons.length, used: lessons.length }
        return { pkg: p, student: sMap[p.student_id], lessons, paid, sum, st: status(sum.balance, paid > 0) }
      })
      .filter((r) => r.student)
      .sort((a, b) => a.student.name.localeCompare(b.student.name))
  }, [data])

  const open = rows.find((r) => r.pkg.id === openId)
  if (open) return <TeacherStudent row={open} onBack={() => setOpenId(null)} reload={load} local={local} />

  const visible = rows.filter((r) => !q || `${r.student.name} ${r.pkg.instrument}`.toLowerCase().includes(q.toLowerCase()))
  const today = todayISO()
  const doneToday = rows.filter((r) => r.lessons.some((l) => l.lesson_date === today)).length

  return (
    <div className="page">
      <header className="top">
        <Brand />
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="hello">
          <b>Hi {data.me?.name?.split(' ')[0] || 'there'} 👋</b>
          <span>{doneToday} lesson{doneToday === 1 ? '' : 's'} logged today</span>
        </div>
      )}
      {rows.length > 6 && <input className="search" style={{ marginBottom: 12 }} placeholder="Search student" value={q} onChange={(e) => setQ(e.target.value)} />}

      {!data ? <p className="muted pad">Loading…</p> : rows.length === 0 ? (
        <div className="empty">No students assigned to you yet. Ask the manager to assign your students.</div>
      ) : (
        <ul className="list">
          {visible.map((r) => {
            const today = r.lessons.some((l) => l.lesson_date === todayISO())
            return (
              <li key={r.pkg.id}>
                <button className={`row ${r.st}`} onClick={() => setOpenId(r.pkg.id)}>
                  <div className="row-main">
                    <div className="name">{r.student.name}{today && <span className="done">✓ today</span>}</div>
                    <div className="sub">{r.pkg.instrument}{r.lessons.length ? ` · last lesson ${fmtDate(r.lessons.reduce((m, l) => (l.lesson_date > m ? l.lesson_date : m), ''))}` : ''}</div>
                  </div>
                  <Balance sum={r.sum} hasPayments={r.paid > 0} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small center-text" style={{ marginTop: 18 }}>Red means the student needs to pay — please remind them or tell the manager.</p>
    </div>
  )
}

function TeacherStudent({ row, onBack, reload, local }) {
  const { pkg, student, lessons, sum, paid } = row
  const [sheet, setSheet] = useState(null) // 'lesson' | 'editLesson'
  const [lessonDate, setLessonDate] = useState(todayISO())
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const { flash, toastNode } = useToast(reload)

  const loggedToday = lessons.some((l) => l.lesson_date === todayISO())
  const st = status(sum.balance, paid > 0)
  const sorted = [...lessons].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date))

  const logLessons = async (dates) => {
    if (!dates.length) return
    setBusy(true)
    const { data, error } = await supabase.from('lessons').insert(dates.map((d) => ({ package_id: pkg.id, lesson_date: d }))).select()
    setBusy(false)
    if (error) return flash(error.message)
    setSheet(null)
    local.add('lessons', data)
    reload()
    const ids = data.map((r) => r.id)
    flash(dates.length === 1 ? `Lesson logged · ${fmtDate(dates[0])}` : `${dates.length} lessons logged`,
      () => supabase.from('lessons').delete().in('id', ids))
  }
  const logLesson = (date) => logLessons([date])
  const saveLesson = async (e) => {
    e.preventDefault()
    const before = editing
    setBusy(true)
    const { data, error } = await supabase.from('lessons').update({ lesson_date: lessonDate }).eq('id', before.id).select().single()
    setBusy(false)
    if (error) return flash(error.message)
    setSheet(null)
    local.upd('lessons', data)
    reload()
    flash(`Lesson moved to ${fmtDate(lessonDate)}`, () => supabase.from('lessons').update({ lesson_date: before.lesson_date }).eq('id', before.id))
  }
  const deleteLesson = async () => {
    const item = editing
    setBusy(true)
    const { error } = await supabase.from('lessons').delete().eq('id', item.id)
    setBusy(false)
    if (error) return flash(error.message)
    setSheet(null)
    local.del('lessons', item.id)
    reload()
    const { id, package_id, created_at, lesson_date, logged_by } = item
    flash('Lesson deleted', () => supabase.from('lessons').insert({ id, package_id, created_at, lesson_date, logged_by }))
  }

  return (
    <div className="page">
      <header className="top">
        <button className="link" onClick={onBack}>← My students</button>
      </header>
      <section className={`hero ${st}`}>
        <div>
          <h1>{student.name}</h1>
          <div className="sub">{pkg.instrument}</div>
        </div>
        <Balance sum={sum} hasPayments={paid > 0} />
      </section>
      {st === 'red' && <p className="notice">{sum.balance < 0 ? `${-sum.balance} lesson${sum.balance === -1 ? '' : 's'} not paid yet.` : 'No paid lessons left.'} Please remind the parent to pay.</p>}

      <div className="actions">
        <button className="btn primary big" disabled={busy} onClick={() => (loggedToday ? setSheet('lesson') : logLesson(todayISO()))}>
          ✓ Lesson today
        </button>
        <button className="btn" onClick={() => setSheet('lesson')}>Other dates</button>
      </div>
      {loggedToday && <p className="muted small center-text">A lesson is already logged for today — use “Other dates” to add more.</p>}

      <h3 className="section">Lessons <span className="hint">· tap to edit</span></h3>
      {sorted.length === 0 ? <p className="muted">No lessons yet.</p> : (
        <div className="group">
          {sorted.map((l) => <LessonItem key={l.id} l={l} onEdit={() => { setEditing(l); setLessonDate(l.lesson_date); setSheet('editLesson') }} />)}
        </div>
      )}

      {sheet === 'lesson' && (
        <Sheet title="Log lessons" onClose={() => setSheet(null)}>
          <MultiDatePicker taken={lessons.map((l) => l.lesson_date)} busy={busy} onSave={logLessons} />
        </Sheet>
      )}
      {sheet === 'editLesson' && editing && (
        <Sheet title="Edit lesson" onClose={() => setSheet(null)}>
          <form onSubmit={saveLesson}>
            <DateField label="Lesson date" value={lessonDate} onChange={setLessonDate} />
            <button className="btn primary full" disabled={busy}>Save</button>
          </form>
          <button className="btn danger full" disabled={busy} onClick={deleteLesson}>Delete this lesson</button>
        </Sheet>
      )}
      {toastNode}
    </div>
  )
}
