-- Supersedes the never-applied draft of this same migration number (that
-- version added one shared schedule_card_height_px scalar). The coach
-- wants a strict, Excel-like grid across the WHOLE weekly board: every
-- row -- in both the Rutinler lane and the Görevler lane -- resizes
-- independently, shared across all 7 days at that row index, leaving
-- every other row untouched. That needs two arrays, not one scalar, one
-- per lane, index = row index.
--
-- schedule_density (0075) is still dropped for the same reason as
-- before: a preset-tier enum has no place once every row is
-- independently draggable.
alter table public.profiles drop column schedule_density;
drop type public.schedule_density;

-- Postgres CHECK constraints can't contain a subquery at all (the
-- original draft of this migration tried `not exists (select ... from
-- unnest(...))`, which is invalid here, not just less idiomatic) -- `<=
-- ALL(array)` is the actual subquery-free way to floor every element.
alter table public.profiles add column schedule_routine_row_heights_px int[]
  constraint schedule_routine_row_heights_px_floor check (
    schedule_routine_row_heights_px is null or 56 <= all (schedule_routine_row_heights_px)
  );

alter table public.profiles add column schedule_task_row_heights_px int[]
  constraint schedule_task_row_heights_px_floor check (
    schedule_task_row_heights_px is null or 56 <= all (schedule_task_row_heights_px)
  );

notify pgrst, 'reload schema';
