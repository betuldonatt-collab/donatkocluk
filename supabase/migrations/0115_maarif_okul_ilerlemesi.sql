-- Adds the "Okul İlerlemesi" pipeline step for Maarif cohort students
-- (9th/10th/11th grade -- exam_type='YKS' rows flagged is_maarif9/10/11).
-- Reuses the same column name/semantics LGS's own Okul İlerlemesi step
-- already established (0085), on the SAME table ordinary YKS students
-- already use (yks_topic_pipeline_status) -- an ordinary (non-Maarif) YKS
-- student's rows simply never get this column toggled from the UI, so
-- nothing changes for them.
alter table public.yks_topic_pipeline_status
  add column if not exists okul_ilerlemesi boolean not null default false;

notify pgrst, 'reload schema';

-- Verification: expect the new column, not null, defaulting to false.
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'yks_topic_pipeline_status'
  and column_name = 'okul_ilerlemesi';
