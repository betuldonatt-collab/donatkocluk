import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { fetchCoachAnnouncements } from "@/lib/announcements";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { ImpersonationLockStyles } from "@/components/impersonation-lock-styles";
import { fetchStopwatchCompetitionRoster, fetchYesterdaysStopwatchWinner, type StopwatchRosterRow, type YesterdaysStopwatchWinner } from "./actions";
import { AnnouncementCenter } from "./_components/announcements/announcement-center";
import { StopwatchSideWidget } from "./_components/stopwatch/stopwatch-side-widget";
import { CoachSidebar } from "./_components/coach-sidebar";

// Throttled to once per PRESENCE_THROTTLE_MS -- see the matching comment
// in app/student/layout.tsx for why. coach_profiles has no row-creation
// trigger (a coach's first navigation lazily creates it), so this can't
// use a plain guarded UPDATE like the student side: it still needs
// upsert's insert-or-update semantics, hence the SELECT to decide
// whether the write is due at all. Still a net win -- a point SELECT by
// primary key skips the row's BEFORE UPDATE trigger, the new row
// version, and the WAL/dead-tuple cost entirely when the existing
// timestamp is already fresh.
const PRESENCE_THROTTLE_MS = 60_000;

async function touchCoachPresence(supabase: Awaited<ReturnType<typeof createClient>>, coachId: string) {
  const { data } = await supabase.from("coach_profiles").select("last_active_at").eq("coach_id", coachId).maybeSingle();
  const isStale = !data?.last_active_at || Date.now() - new Date(data.last_active_at).getTime() > PRESENCE_THROTTLE_MS;
  if (!isStale) return;
  await supabase.from("coach_profiles").upsert({ coach_id: coachId, last_active_at: new Date().toISOString() }, { onConflict: "coach_id" });
}

async function fetchLayoutData(effectiveUserId: string, realUserId: string, isImpersonating: boolean) {
  const supabase = await createClient();

  const [{ count }, { data: profile }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", effectiveUserId)
      .eq("status", "active"),
    // realUserId, not effectiveUserId -- the sidebar greeting is always
    // the actual logged-in person, not whichever coach an admin might
    // currently be viewing as.
    supabase.from("profiles").select("full_name").eq("id", realUserId).maybeSingle(),
    // Presence touch is a write -- never fires while impersonating,
    // regardless of who the real caller is.
    isImpersonating ? Promise.resolve(null) : touchCoachPresence(supabase, effectiveUserId),
  ]);

  return { unreadCount: count ?? 0, fullName: profile?.full_name ?? null };
}

export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const view = await requireViewContext("coach");
  const { effectiveUserId, realUserId, isImpersonating, targetName } = view;
  const now = new Date();

  // Same reasoning as CoachDashboardPage's own fallback: this layout
  // wraps every /coach/* route, so it re-renders (alongside the page)
  // whenever a Server Action invoked from one of them resolves -- a
  // transient failure here shouldn't be able to take that action's own
  // response down with it. Sidebar badge/greeting/widgets degrading to
  // their empty state for one render is a fine trade for that.
  let unreadCount = 0;
  let fullName: string | null = null;
  let announcements: Awaited<ReturnType<typeof fetchCoachAnnouncements>> = [];
  let stopwatchRoster: StopwatchRosterRow[] = [];
  let yesterdaysWinner: YesterdaysStopwatchWinner = null;
  try {
    [{ unreadCount, fullName }, announcements, stopwatchRoster, yesterdaysWinner] = await Promise.all([
      fetchLayoutData(effectiveUserId, realUserId, isImpersonating),
      fetchCoachAnnouncements(),
      // Skipped while impersonating for the same reason announcements is --
      // the whole panel renders inside a disabled <fieldset> then anyway,
      // so there's nothing for this widget to usefully show.
      isImpersonating
        ? Promise.resolve([] as StopwatchRosterRow[])
        : (async () => {
            const supabase = await createClient();
            return fetchStopwatchCompetitionRoster(supabase, effectiveUserId, now.getUTCFullYear(), now.getUTCMonth() + 1);
          })(),
      isImpersonating
        ? Promise.resolve(null as YesterdaysStopwatchWinner)
        : (async () => {
            const supabase = await createClient();
            return fetchYesterdaysStopwatchWinner(supabase, effectiveUserId);
          })(),
    ]);
  } catch (e) {
    console.error("[CoachLayout] layout data fetch failed", e);
  }

  return (
    <div className="flex flex-1 flex-col">
      {isImpersonating && (
        <>
          <ImpersonationBanner targetName={targetName ?? "kullanıcı"} />
          <ImpersonationLockStyles />
        </>
      )}
      <DashboardShell sidebar={<CoachSidebar unreadCount={unreadCount} fullName={fullName} />}>
        {isImpersonating ? <fieldset disabled className="contents">{children}</fieldset> : children}
      </DashboardShell>
      <AnnouncementCenter announcements={announcements} />
      <StopwatchSideWidget roster={stopwatchRoster} yesterdaysWinner={yesterdaysWinner} />
    </div>
  );
}
