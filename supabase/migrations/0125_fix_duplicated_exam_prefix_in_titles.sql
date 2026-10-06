-- Branş Denemesi titles that were saved with the exam prefix twice ("TYT TYT Fen", "AYT AYT Matematik — Limit") by a
-- student-created task. The code that built them is fixed (courseDisplayName); this tidies the rows already saved.
--
-- Only a title that STARTS with the same prefix twice is touched ("TYT TYT " -> "TYT ", "AYT AYT " -> "AYT "); every
-- other title is left exactly as it is. Idempotent: a second run finds nothing to change.
--
-- Rollback: none needed (the duplicated prefix was never meaningful).

update public.student_tasks
set title = regexp_replace(title, '^(TYT|AYT) \1 ', '\1 ')
where title ~ '^(TYT|AYT) \1 ';

-- Verification (run after applying; expect 0):
--   select count(*) from public.student_tasks where title ~ '^(TYT|AYT) \1 ';
