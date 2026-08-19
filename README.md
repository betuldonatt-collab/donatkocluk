# Koçluk Platformu

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase project URL + anon key
pnpm dev
```

Apply the database schema in `supabase/migrations/` to your Supabase project
(via the SQL editor, or the Supabase CLI: `supabase db push`).

## Structure

- `app/` — one folder per role (`student/`, `parent/`, `coach/`, `admin/`),
  gated by `proxy.ts` based on the signed-in user's `profiles.role`. `/` is
  the panel picker / entry page.
- `components/ui/` — shadcn/ui primitives (hand-installed; the CLI's `init`
  endpoint is unreachable from this sandbox, so components are added by
  copying source directly — same result as the CLI produces).
- `lib/supabase/` — browser, server, and proxy (middleware) Supabase clients.
- `supabase/migrations/` — SQL schema, starting with `profiles` (shared
  table, `role` enum column tags each user as student/parent/coach/admin).
