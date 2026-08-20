# Koçluk Platformu

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase — TYT/AYT
exam-coaching platform for student/parent/coach/admin roles. Runs entirely
against a **local** Supabase (Docker), not the cloud project.

## Setup

```bash
pnpm install
npx supabase start          # starts local Postgres/Auth/Storage in Docker
pnpm dev
```

`supabase start` prints a local `ANON_KEY` — put it, with the local API URL,
into `.env.local` (see `.env.local.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase start`>
```

Migrations and `supabase/seed.sql` apply automatically on `supabase start` /
`supabase db reset`. The seed creates a standing local admin account:
`admin@local.dev` / `LocalAdmin123!` — sign in at `/login?role=admin`, no
sign-up needed. Supabase Studio (table/data browser) is at
`http://127.0.0.1:54323`.

## Structure

- `app/` — one folder per role (`student/`, `parent/`, `coach/`, `admin/`),
  gated by `proxy.ts` based on the signed-in user's `profiles.role`. `/` is
  the panel picker / entry page. Admins additionally get an exception in
  `proxy.ts` to browse every panel, with a switcher bar (rendered from each
  panel's `layout.tsx`) to jump between them without logging out.
- `components/ui/` — shadcn/ui primitives (hand-installed; the CLI's `init`
  endpoint is unreachable from this sandbox, so components are added by
  copying source directly — same result as the CLI produces).
- `lib/supabase/` — browser, server, and proxy (middleware) Supabase clients.
- `lib/curriculum/` — generated TYT/AYT course data (see below). Don't hand-edit
  the JSON.
- `supabase/migrations/` — SQL schema: `profiles` (role-tagged user table,
  shared across all four roles) plus the persisted student-data tables
  (`task_completions`, `student_resources`, `student_resource_progress`,
  `paragraf_problem_entries`), all RLS-scoped to their owning student.
- `supabase/seed.sql` — recreates the local admin account on every reset.
- `supabase/curriculum-source/` — the source `.xlsx` workbooks the curriculum
  is generated from.

## Curriculum data

`lib/curriculum/*.json` is generated from the three official curriculum
workbooks in `supabase/curriculum-source/` (Sayısal / Eşit Ağırlık / Sözel).
Re-run after the source workbooks change:

```bash
pnpm run parse-curriculum
```

## Student data persistence

Ödevler, Kaynak Takibi, and Paragraf/Problem Takibi read/write real Supabase
tables via Server Components + Server Actions (`actions.ts` next to each
page) — not local React state. Each student only ever sees their own rows
(RLS `student_id = auth.uid()`). Coach/parent/admin views into that data,
homework assignment, and file-upload storage for excuse photos are not built
yet — see the project's v1.1 plan for what's intentionally deferred.
