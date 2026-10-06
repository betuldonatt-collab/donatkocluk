-- "Kaynak Taraması" (task_type = 'resource_review'): a new task type for going back over questions the student got
-- wrong, left blank or struggled with. It behaves exactly like "Soru Çözümü" (a course and topic, a time and / or
-- question-count target, Doğru / Yanlış / Boş results that flow into the topic stats, Soru Dağılımı and the Karne).
--
-- Two things in the database:
--   1. The enum public.task_type (student_tasks.task_type, created in 0005) gets the 'resource_review' label.
--   2. prevent_student_task_core_tampering() requires Doğru / Yanlış / Boş before an LGS / 7th-grade 'question_bank' or
--      'branch_exam' task can be sent for the coach's approval (0101 / 0109 / 0110); 'resource_review' joins that list,
--      so it is held to the same rule. The function is patched IN PLACE (its live definition is read with
--      pg_get_functiondef, the one list is replaced, the result re-created), comparing new.task_type::text against
--      plain text literals so it never depends on the new enum label being committed yet (the lesson of 0110). The
--      statement aborts, changing nothing, if that list is not found; a second run finds it already patched.
--
-- Every other rule of that trigger already applies to the new type without a change: it is not exempt from the photo
-- (only 'reading' and 'vocab_quiz' are), so an LGS / 7th grader needs a Kanıt Fotoğrafı and the coach's approval, exactly
-- as for Soru Çözümü. The topic-stats / daily-stats functions count every task type, so nothing changes there.
--
-- Idempotent: safe to run more than once.
-- Rollback: enum labels cannot be dropped (an unused one is harmless); re-run the function definition of 0110 to undo the patch.

alter type public.task_type add value if not exists 'resource_review';

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure);

  if position('''resource_review''' in v_def) > 0 then
    raise notice 'prevent_student_task_core_tampering already includes resource_review; left as is.';
    return;
  end if;

  if position('new.task_type in (''question_bank'', ''branch_exam'')' in v_def) = 0 then
    raise exception 'Unexpected prevent_student_task_core_tampering definition: the question_bank / branch_exam list was not found; nothing changed.';
  end if;

  execute replace(
    v_def,
    'new.task_type in (''question_bank'', ''branch_exam'')',
    'new.task_type::text in (''question_bank'', ''branch_exam'', ''resource_review'')'
  );
end;
$$;

notify pgrst, 'reload schema';

-- Verification (run after applying; expect true, true):
select exists (
  select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'task_type' and e.enumlabel = 'resource_review'
) as resource_review_enum_label_exists,
position('resource_review' in pg_get_functiondef('public.prevent_student_task_core_tampering()'::regprocedure)) > 0
  as trigger_includes_resource_review;
