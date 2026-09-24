-- "9. Sınıf" as a selectable Akademik Alan for students.
--
-- profiles.academic_track is NOT a free-text column: 0029 typed it with the
-- existing enum public.coach_specialization (the same one coach_profiles
-- .specialization uses), so a new option needs a new enum value.
--
--   - ADD VALUE only appends; no existing row, column or function changes.
--   - Nothing in the app enumerates the enum's values dynamically: the coach
--     specialization picker and every label map are hard-coded lists, so the
--     coach side never offers or shows the new value.
--   - Postgres 12+ allows this inside a transaction as long as the new value
--     is not used in that same transaction (it is not here).
--
-- Rollback: enum values cannot be dropped; leaving an unused value is harmless.

alter type public.coach_specialization add value if not exists 'maarif9';

notify pgrst, 'reload schema';
