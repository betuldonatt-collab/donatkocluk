-- Unified Karne: the frozen snapshot behind the parent's report card.
--
-- The new 1-2 page Karne (completion, questions solved, study time, consistency, event attendance, weekly trend, exam overview) is
-- computed live for the student and the coach, but a PARENT only ever sees coach-approved periods and must always see the same
-- numbers they saw when the report card was approved. So approval stores the computed summary on the card itself:
--
--   student_report_cards.executive_summary  jsonb  -- the whole KarneSummary (lib/karne-summary.ts), versioned inside the JSON.
--
-- Nothing else is added: the coach's note stays in the existing coach_notes column (one single note, editable before approval, as
-- today). Row-level security is unchanged -- the new column is simply part of the row that the student (approved only), the parent
-- (approved only, linked child) and the coach already read.
--
-- Cards approved before this migration have no snapshot (null): the app reads them live until a snapshot is stored for them. A
-- snapshot, once stored, cannot be changed (trigger below) -- that is what "frozen" means; setting it for the first time is always
-- allowed, so older cards can be given one.
--
-- Idempotent: safe to run more than once. Rollback: see the bottom.

alter table public.student_report_cards
  add column if not exists executive_summary jsonb;

create or replace function public.guard_report_card_executive_summary()
returns trigger
language plpgsql
as $$
begin
  if old.executive_summary is not null
     and new.executive_summary is distinct from old.executive_summary then
    raise exception 'executive_summary_frozen: bu karnenin özeti onay sırasında kaydedildi, değiştirilemez.';
  end if;
  return new;
end
$$;

drop trigger if exists student_report_cards_guard_executive_summary on public.student_report_cards;
create trigger student_report_cards_guard_executive_summary
  before update on public.student_report_cards
  for each row execute function public.guard_report_card_executive_summary();

notify pgrst, 'reload schema';

-- Verification: expect both columns true.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_report_cards' and column_name = 'executive_summary'
  ) as summary_column,
  exists (
    select 1 from pg_trigger where tgname = 'student_report_cards_guard_executive_summary' and not tgisinternal
  ) as freeze_guard;

-- ROLLBACK:
--   drop trigger student_report_cards_guard_executive_summary on public.student_report_cards;
--   drop function public.guard_report_card_executive_summary();
--   alter table public.student_report_cards drop column executive_summary;
