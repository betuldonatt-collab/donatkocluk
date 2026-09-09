-- "Anlık Çalışma Durumu" -- lets a coach see whether a student is
-- currently running a focus-timer session, without any new table or
-- RLS policy: profiles_update_own already lets a student write their
-- own row, and profiles_select_by_coach already lets a coach read every
-- column of their own students' rows. A student's client sends a
-- heartbeat (see sendFocusHeartbeat in app/student/actions.ts) every 20s
-- while the timer is actually running; a coach treats the timestamp as
-- "live" only while it's fresher than the shared staleness window in
-- lib/focus-live-status.ts (45s) -- so a session that ends without a
-- clean unmount (closed tab, lost connection) self-heals within ~45s
-- instead of showing "Çalışıyor" forever.
alter table public.profiles add column active_focus_heartbeat_at timestamptz;

notify pgrst, 'reload schema';
