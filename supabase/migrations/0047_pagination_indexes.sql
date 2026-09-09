-- Supports the admin roster's role+name filter/sort, and the new
-- page-based pagination on /admin/students.
create index if not exists profiles_role_full_name_idx on public.profiles (role, full_name);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

-- coach_students only had an implicit unique index on student_id;
-- coach-scoped lookups (roster, capacity, admin coach detail) scanned
-- unindexed.
create index if not exists coach_students_coach_id_idx on public.coach_students (coach_id);

create index if not exists coach_notes_coach_id_idx on public.coach_notes (coach_id);
create index if not exists coach_notes_type_idx on public.coach_notes (type);
create index if not exists coach_notes_parent_share_status_idx on public.coach_notes (parent_share_status) where parent_share_status = 'pending';

create index if not exists student_resources_student_id_idx on public.student_resources (student_id);
create index if not exists paragraf_problem_entries_student_id_idx on public.paragraf_problem_entries (student_id);

create index if not exists announcements_is_active_created_at_idx on public.announcements (is_active, created_at desc);

-- Partial index -- only completed-session counts are scanned platform-wide
-- (Yenileme Radarı / avg-rating computations), never the full table.
create index if not exists coaching_sessions_outcome_idx on public.coaching_sessions (outcome) where outcome = 'completed';
