alter type public.notification_type add value 'pending_task_approval';

alter table public.notifications add column reference_id uuid;

create index notifications_reference_idx on public.notifications (coach_id, type, reference_id);

notify pgrst, 'reload schema';
