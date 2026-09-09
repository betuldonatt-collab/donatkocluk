-- Kronometre Yarışması (Stopwatch Competition):
--   - profiles.sinif_sube: plain coach-editable text field (student's
--     class/section), same family as school_name -- not one of the
--     admin-only "system fields" prevent_student_system_field_tampering
--     guards, so the existing profiles_coach_update RLS policy already
--     covers writing it with no policy change needed.
--   - get_daily_stopwatch_ranking(): this app's first cross-student
--     aggregate function. student_tasks has no student-to-student read
--     policy at all (by design -- a student's own task content, scores,
--     titles etc. are private), so there is no RLS-only way for a
--     student to see even a sliver of another student's data. This
--     function is the narrow, deliberate exception: security definer
--     (like is_admin()) so it can read across the caller's own coach's
--     entire roster, but it takes NO caller-supplied student id -- it
--     only ever resolves auth.uid()'s own coach via coach_students, then
--     returns exactly five scalars (never a row per student): the
--     caller's own rank/total, and whoever's #1's name/total. A student
--     can never use it to probe an arbitrary other student.
alter table public.profiles add column sinif_sube text;

create function public.get_daily_stopwatch_ranking()
returns table (
  my_rank int,
  my_total_minutes int,
  top_student_name text,
  top_student_total_minutes int,
  participant_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with totals as (
    select
      cs.student_id,
      p.full_name,
      coalesce(sum(st.duration_minutes), 0)::int as total_minutes
    from public.coach_students cs
    join public.profiles p on p.id = cs.student_id
    left join public.student_tasks st
      on st.student_id = cs.student_id and st.task_date = (now() at time zone 'utc')::date
    where cs.coach_id = (select coach_id from public.coach_students where student_id = auth.uid())
    group by cs.student_id, p.full_name
  ),
  ranked as (
    select student_id, full_name, total_minutes, rank() over (order by total_minutes desc) as rnk
    from totals
  )
  select
    (select rnk from ranked where student_id = auth.uid()),
    (select total_minutes from ranked where student_id = auth.uid()),
    (select full_name from ranked order by rnk asc limit 1),
    (select total_minutes from ranked order by rnk asc limit 1),
    (select count(*)::int from ranked);
$$;

grant execute on function public.get_daily_stopwatch_ranking() to authenticated;
