# Changelog

## v1.1 — Excel curriculum pipeline, persistent student data, admin view switcher

Base state: local-only Supabase (Docker), no cloud/GitHub dependency for
data. This release moves the student panel from UI mockups to a real,
persisted data layer, replaces the hand-typed curriculum with data generated
from the official workbooks, and gives admins a way to preview every role's
panel without logging out.

### Added

- **Curriculum pipeline** (`scripts/parse-curriculum.mjs`): parses the three
  official workbooks (`supabase/curriculum-source/*.xlsx` — Sayısal, Eşit
  Ağırlık, Sözel) into `lib/curriculum/*.json`, replacing the hand-typed
  `courses.ts` mock. Handles per-course row-blocks with inconsistent column
  layouts, a shared TYT+AYT Geometri list reused across tracks, and captures
  8 years of historical per-topic question-frequency data as a bonus field.
  Re-run with `pnpm run parse-curriculum` whenever the source workbooks
  change.
- **Persistent student data** (`supabase/migrations/0002_student_data.sql`):
  `task_completions`, `student_resources`, `student_resource_progress`,
  `paragraf_problem_entries` — all RLS-scoped to `student_id = auth.uid()`.
  Ödevler, Kaynak Takibi, and Paragraf/Problem Takibi are now Server
  Components + Server Actions (`actions.ts` per feature) instead of
  `useState` mocks; verified end-to-end (toggle → reload → still there).
- **Admin view switcher**: `proxy.ts` lets an admin's own session browse
  every panel (`/student`, `/parent`, `/coach`, `/admin`) instead of being
  bounced to their own home; a persistent top bar (`components/admin-view-
  switcher.tsx`), rendered from each panel's `layout.tsx`, lets them jump
  between views. Non-admins never see it or gain any extra access.
- **Local admin fixture** (`supabase/seed.sql`): `admin@local.dev` /
  `LocalAdmin123!`, recreated automatically by every `supabase db reset`.
- `is_admin()` security-definer helper (`0001_profiles.sql`) — fixes an
  infinite-recursion bug in the original `profiles` RLS policy and is now
  the reusable pattern for any future "is this caller an admin" check.

### Fixed

- Admin panel-picker link on `/` (stray backtick instead of `?` broke the
  route).
- Missing explicit `grant`s on `public.profiles` — newer Supabase no longer
  auto-exposes new tables to API roles.
- Turkish locale-casing bug in the curriculum parser ("Mantık" → "Mantik").

### Explicitly deferred (not in v1.1)

Scoped out during planning, not overlooked — tracked here so v1.2 planning
starts from an accurate baseline:

- Weekly planner (Haftalık Plan), reading log (Kitap Okuma Rutini), deneme
  results/analysis, and the student intake form (Ana Sayfa) — all present as
  blank templates in the source workbooks, none have UI yet.
- Coach/parent read access to student data (needs `coach_students` /
  `parent_students` relation tables — not yet designed).
- Homework assignment system (task definitions are still hardcoded in
  `odevler-client.tsx`; only completion state persists).
- Excuse-photo upload persistence (Supabase Storage bucket + policy).
- Password reset flow, visible sign-out control.

### Known non-blocking issue

`supabase_vector` (Studio's log-shipping container) crash-loops on this
host — can't reach the Docker socket over the current network path. Doesn't
affect Postgres/Auth/REST/Storage; only Studio's live log tail is degraded.
