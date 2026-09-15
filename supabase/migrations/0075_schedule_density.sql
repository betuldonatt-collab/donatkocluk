-- Coach- and student-adjustable "how tall are weekly-grid task cards"
-- preference (Kompakt / Orta / Rahat) -- a shared display setting, not
-- panel-specific business logic, so it lives on profiles itself rather
-- than a per-panel table. profiles_update_own (0001) has no column
-- restriction, and no existing tampering trigger
-- (prevent_student_system_field_tampering, prevent_student_competition_
-- field_tampering) references this field, so it's freely self-updatable
-- by any authenticated user -- student or coach -- on their own row with
-- no new RLS policy needed.
create type public.schedule_density as enum ('compact', 'medium', 'comfortable');

alter table public.profiles add column schedule_density public.schedule_density not null default 'medium';

notify pgrst, 'reload schema';
