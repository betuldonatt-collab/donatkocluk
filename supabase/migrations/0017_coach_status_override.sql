-- Coach status override ("Yapıldı / Yarım / Yapılmadı") needs a 3rd
-- "partially done" state that doesn't exist yet. Every current student
-- panel read of `status` is a strict `=== "done"` check
-- (task-card.tsx, week-task-cell.tsx) with no label lookup and no
-- default/switch case -- confirmed by direct inspection -- so a task
-- sitting in this new state simply reads as "not done yet" there: no
-- crash, no "undefined" text, just no green highlight until it's
-- flipped to fully done.
alter type public.task_status add value 'half_done' after 'done';
