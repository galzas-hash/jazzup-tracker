import { createClient } from '@supabase/supabase-js'

// A no-op lock: the default cross-tab lock can freeze sign-in when the
// installed app and a browser tab are open at the same time.
const noLock = async (_name, _timeout, fn) => fn()

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { lock: noLock, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
