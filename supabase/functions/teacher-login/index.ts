// Manager-only: create or reset a teacher's login and return a new password.
// Body: { action: "set_login", teacher_id, email }  |  { action: "remove_login", teacher_id }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  return `Jazz-${s.slice(0, 4)}-${s.slice(4)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: isManager } = await caller.rpc('is_manager')
    if (!isManager) return json({ error: 'Only the manager can do this.' }, 403)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { action, teacher_id, email: rawEmail } = await req.json()

    const { data: teacher, error: tErr } = await admin.from('teachers').select('*').eq('id', teacher_id).single()
    if (tErr || !teacher) return json({ error: 'Teacher not found.' }, 404)

    if (action === 'remove_login') {
      if (teacher.user_id) await admin.auth.admin.deleteUser(teacher.user_id)
      await admin.from('teachers').update({ user_id: null, email: null }).eq('id', teacher_id)
      return json({ ok: true })
    }

    if (action !== 'set_login') return json({ error: 'Unknown action.' }, 400)
    const email = String(rawEmail || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Please enter a valid email.' }, 400)

    const { data: mgr } = await admin.from('managers').select('email').ilike('email', email).maybeSingle()
    if (mgr) return json({ error: "That's the manager's email — use a different one for the teacher." }, 400)
    const { data: other } = await admin.from('teachers').select('id').eq('email', email).neq('id', teacher_id).maybeSingle()
    if (other) return json({ error: 'Another teacher already uses this email.' }, 400)

    const password = makePassword()
    let userId: string | null = teacher.user_id

    // Email changed: drop the old login
    if (userId && teacher.email && teacher.email !== email) {
      await admin.auth.admin.deleteUser(userId)
      userId = null
    }

    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) {
        // An account with this email may already exist (e.g. removed teacher re-added)
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = list?.users.find((u) => u.email?.toLowerCase() === email)
        if (!existing) return json({ error: error.message }, 400)
        await admin.auth.admin.updateUserById(existing.id, { password })
        userId = existing.id
      } else {
        userId = data.user.id
      }
    }

    const { error: upErr } = await admin.from('teachers').update({ email, user_id: userId }).eq('id', teacher_id)
    if (upErr) return json({ error: upErr.message }, 400)
    return json({ ok: true, email, password })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})
