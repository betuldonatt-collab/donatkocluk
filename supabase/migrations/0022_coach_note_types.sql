-- Categorized coach notes ("+ Not Ekle" on the student detail page):
-- coach_notes existed since 0005 but was never wired up to any UI or
-- automation -- this adds a type/category so the coach can log a note as
-- a main session, a quick check-in, or a parent/guardian meeting, with an
-- optional descriptor of who was spoken with for the latter.
--
-- No RLS changes needed: coach_notes_coach_all / coach_notes_admin_all
-- (0005) are already `for all`, column-agnostic policies that cover these
-- new columns for free. `default 'main_session'` keeps the `not null`
-- addition safe regardless of whether any rows already exist.

create type public.coach_note_type as enum ('main_session', 'check_in', 'parent_meeting');

alter table public.coach_notes
  add column type public.coach_note_type not null default 'main_session',
  add column guardian_descriptor text;

alter table public.coach_notes
  add constraint coach_notes_guardian_descriptor_requires_parent_meeting
    check (guardian_descriptor is null or type = 'parent_meeting');
