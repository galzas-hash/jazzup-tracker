# JazzUp Tracker — project notes

Lesson & payment tracker for the JazzUp music school (Thailand), built by Galit for the school's manager. Mobile-first, English, dates shown as dd/mm/yy.

## Where things live
- **Live app:** https://jazzup-tracker.vercel.app (Vercel project `jazzup-tracker`, team `galzas-9090s-projects`). Every push to `main` auto-deploys.
- **Code:** GitHub `galzas-hash/jazzup-tracker`
- **Database/auth:** Supabase project "JazzUp Tracker", ref `trywuplwbworauzwmblk`, region ap-southeast-1 (Singapore), free tier.
- The Supabase URL + publishable key in `.env` are public by design; all data is protected by row-level security.

## Stack
React 18 + Vite, `@supabase/supabase-js`. No router — screens are switched with state.
- `src/App.jsx` — login, role routing, manager screens (student list, student detail, add/edit, export text)
- `src/TeacherApp.jsx` — teacher view (own students, log/edit/undo lessons only)
- `src/Teachers.jsx` — "Team" page: teachers (add, login, assign) + managers (invite, reset, remove)
- `src/ui.jsx` — shared UI: Sheet, DateField (dd/mm/yy over native date input), Balance, LessonItem, Brand, useToast (with Undo)
- `src/cache.js` — localStorage cache (data + role per user) so the app opens instantly; `localOps` for in-place updates after writes
- `src/UpdateBanner.jsx` — compares `__BUILD_ID__` with `/version.json` (emitted by a plugin in `vite.config.js`) and shows a "Reload" bar when a new version is live
- `src/logic.js` — balance + FIFO matching of lessons to payments, parent message text, date formatting
- `supabase/functions/teacher-login/index.ts` — Edge Function (manager-only) that creates/resets/removes teacher and manager logins via the admin API and returns a generated password
- `public/` — logo, icons (incl. maskable), `manifest.webmanifest`, `sw.js` (no-cache service worker, only for installability)

## Data model
- `students` (name) → `packages` (one per instrument; `teacher_id`, `archived`) → `payments` (plan_lessons ∈ {1,4,8,10}, paid_on) and `lessons` (lesson_date, `logged_by` = auth uid)
- `teachers` (name, email, user_id, active) · `managers` (email, hidden)
- Balance = paid lessons − lessons taken. Lessons are matched to payments oldest-first, so owed lessons (negative balance) are covered by the next payment.
- Status colours: red = 0 or owed / no payment, orange = 1 left, green = 2+.

## Roles & security
- `is_manager()`, `current_teacher_id()`, `my_role()`, `my_paid_lessons()` — SECURITY DEFINER helpers (advisor warnings about them are intentional; they only describe the caller).
- Manager: full access to everything.
- Hidden admin: a manager row with `hidden = true` (Galit). Full access, but not shown in the Team page managers list and can't be reset/removed by regular managers (enforced in the Edge Function).
- Teacher: reads own packages/students, full CRUD on lessons of own packages, no access to payments (gets paid totals via `my_paid_lessons()`).
- Logins are email + password only. No email sending is configured (Supabase site URL not set), so there's no self-service "forgot password" — managers reset passwords from the Team page.

## Decisions (from Galit)
- As free as possible; manager-only to start, parents get updates via a LINE/WhatsApp-ready text instead of logins.
- Record plan + payment date + lesson dates only (no amounts or payment methods for now).
- Visual flags only, no automatic reminders.
- Teachers log lessons only; manager adds teachers and creates their logins in the app.
- Branding from the school logo: yellow #FDCA01 + black, Montserrat 900 headings.

## Ideas parked for later
- Monthly report for the manager (discussed, postponed). Would need a price list per plan to show income.

## Performance notes
- After a write, the screen updates from the returned row (`localOps`) and a full refresh runs in the background — never `await reload()` after a write.
- Data and role are cached on the device and shown immediately on open, then refreshed.
- Lesson logging uses `MultiDatePicker` (tap several days) — handy for onboarding old notes.

## Working notes
- This sandbox can't reach Supabase/Vercel directly; use the Supabase/Vercel MCP tools. DB checks: run SQL with `set local role authenticated` + `request.jwt.claims` inside a rolled-back transaction.
- UI checks: `vite preview` + Playwright with mocked Supabase routes.
- Two small migrations (manager `name` column; managers policy perf tweak) were cancelled at approval — not applied, nothing depends on them.
