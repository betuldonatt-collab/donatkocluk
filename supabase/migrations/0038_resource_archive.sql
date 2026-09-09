-- Group 4a (Archive vs. Delete for Resources): a resource with historical
-- student data attached (task_resources / student_resource_progress) can
-- no longer be usefully hard-deleted without destroying that history, but
-- a coach still needs a way to stop it showing up for new assignments.
-- is_active defaults true so every existing resource is unaffected.
alter table public.student_resources add column is_active boolean not null default true;
