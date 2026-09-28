-- Every coach note now enters the admin approval queue by default. Before this,
-- parent_share_status defaulted to 'none' and only a manually-added note with
-- the "share with parent" box ticked ever reached the queue -- the post-session
-- evaluation note (evaluateSessionCompleted) never did, so it could never
-- appear on the parent's "Koçtan Notlar".
--
-- Veli Görüşmesi (parent_meeting) notes stay 'none' (check constraint from
-- 0023); the app sets that explicitly. Existing rows are NOT touched, so old /
-- imported notes don't flood the queue.
alter table public.coach_notes
  alter column parent_share_status set default 'pending';

notify pgrst, 'reload schema';
