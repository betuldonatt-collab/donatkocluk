-- Coach-facing "lock this card in place" for the schedule builder -- a
-- locked task/event can't be dragged (enforced client-side via dnd-kit's
-- own useSortable({ disabled }), no RLS change needed: the existing
-- student_tasks_coach_all / student_events_coach_all FOR ALL policies
-- already let a coach update any column on their own roster's rows, so
-- is_locked is just another one of those columns). Purely additive,
-- defaults false, no backfill needed.
alter table public.student_tasks add column is_locked boolean not null default false;
alter table public.student_events add column is_locked boolean not null default false;

notify pgrst, 'reload schema';
