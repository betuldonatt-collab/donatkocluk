-- student_daily_stats (0031) tracked total/correct/wrong but never
-- empty ("Boş") -- the new Daily/Weekly stats summary widget needs all
-- three breakdown figures (Doğru/Yanlış/Boş) alongside the total.
alter table public.student_daily_stats add column empty_count integer not null default 0;
