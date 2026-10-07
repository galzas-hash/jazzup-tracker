// Pure helpers: balance, FIFO allocation of lessons to payments, export text.

export const PLANS = [1, 4, 8]

export function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export function fmtDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const byDate = (key) => (a, b) =>
  a[key] === b[key] ? (a.created_at || '').localeCompare(b.created_at || '') : a[key].localeCompare(b[key])

/**
 * Lessons are matched to payments oldest-first, so an owed lesson is
 * automatically covered by the next payment.
 * Returns { balance, paidTotal, used, current, owed }
 *  - current: { payment, lessons } for the latest payment that has any lessons
 *    or the latest payment overall
 *  - owed: lessons not covered by any payment
 */
export function summarize(payments = [], lessons = []) {
  const pays = [...payments].sort(byDate('paid_on'))
  const less = [...lessons].sort(byDate('lesson_date'))
  const paidTotal = pays.reduce((s, p) => s + p.plan_lessons, 0)
  const buckets = pays.map((p) => ({ payment: p, lessons: [] }))
  const owed = []
  let bi = 0
  for (const l of less) {
    while (bi < buckets.length && buckets[bi].lessons.length >= buckets[bi].payment.plan_lessons) bi++
    if (bi < buckets.length) buckets[bi].lessons.push(l)
    else owed.push(l)
  }
  // "current" = the payment currently being used up: first bucket not full, else the last one
  const current = buckets.find((b) => b.lessons.length < b.payment.plan_lessons) || buckets[buckets.length - 1] || null
  return { balance: paidTotal - less.length, paidTotal, used: less.length, current, owed, buckets }
}

export function status(balance, hasPayments) {
  if (!hasPayments) return 'red'
  if (balance <= 0) return 'red'
  if (balance === 1) return 'amber'
  return 'ok'
}

export function exportText(studentName, instrument, payments, lessons) {
  const s = summarize(payments, lessons)
  const first = studentName.trim().split(/\s+/)[0]
  const lines = [`Hi! Here's an update on ${first}'s ${instrument} lessons at JazzUp 🎵`, '']

  // Show the latest payment's lessons. If it's untouched, show the one before it too (context).
  const show = []
  if (s.buckets.length) {
    const idx = s.buckets.indexOf(s.current)
    if (s.current && s.current.lessons.length === 0 && idx > 0) show.push(s.buckets[idx - 1])
    if (s.current) show.push(s.current)
  }
  for (const b of show) {
    const p = b.payment
    lines.push(`Payment: ${p.plan_lessons}-lesson plan, paid ${fmtDate(p.paid_on)}`)
    lines.push(
      b.lessons.length
        ? `Lessons: ${b.lessons.map((l) => fmtDate(l.lesson_date)).join(', ')} (${b.lessons.length} of ${p.plan_lessons} used)`
        : `Lessons: none yet (0 of ${p.plan_lessons} used)`
    )
    lines.push('')
  }
  if (s.owed.length) {
    lines.push(
      `Lessons taken without payment: ${s.owed.map((l) => fmtDate(l.lesson_date)).join(', ')} (${s.owed.length})`
    )
    lines.push('')
  }

  if (s.balance > 0) {
    lines.push(`Lessons left: ${s.balance}`)
    if (s.balance === 1) lines.push('Next lesson is the last one on this plan — renewal will be due soon.')
  } else {
    if (s.balance < 0) lines.push(`Lessons owed: ${-s.balance} (will be deducted from the next plan)`)
    else lines.push('Lessons left: 0')
    lines.push('Time to renew — we offer 1, 4 or 8 lesson plans.')
  }
  lines.push('', 'Thank you! 🙏')
  return lines.join('\n')
}
