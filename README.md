# JazzUp Tracker

Simple lesson & payment tracker for the JazzUp music school.

- Students can have several instruments, each with its own lesson balance
- Plans: 1, 4, 8 or 10 lessons; lessons are matched to payments oldest-first
- Red = needs payment, amber = 1 lesson left
- "Send to parent" builds a LINE/WhatsApp-ready message

Stack: React + Vite, Supabase (project "JazzUp Tracker"), deployed on Vercel.
The Supabase URL and publishable key in `.env` are public by design; data is protected by row-level security (only emails in the `managers` table can read or write).
