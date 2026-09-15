import { requireViewContext } from "@/lib/impersonation";
import { fetchStudentAnnouncements } from "@/lib/announcements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { ImpersonationLockStyles } from "@/components/impersonation-lock-styles";
import { getDailyStopwatchRanking, type DailyStopwatchRanking } from "./actions";
import { AnnouncementCenter } from "./_components/announcements/announcement-center";
import { StudentSidebar } from "./_components/sidebar";
import { StopwatchWidget } from "./_components/stopwatch/stopwatch-widget";

const EMPTY_RANKING: DailyStopwatchRanking = {
  myRank: null,
  myTotalMinutes: null,
  topStudentName: null,
  topStudentTotalMinutes: null,
  participantCount: 0,
  yesterdayWinnerName: null,
  yesterdayWinnerTotalMinutes: null,
};

// Presence heartbeat for the admin directory's online indicator -- never
// fires while impersonating, so simply viewing a student's panel as them
// can't mutate their data.
//
// Throttled to once per PRESENCE_THROTTLE_MS: this layout wraps every
// page in the panel, so without a guard it wrote on every single
// navigation, not once per session -- and profiles carries a BEFORE
// UPDATE trigger that runs its own is_admin() lookup, so each write was
// really a write plus an extra read against the single most-read table
// in the app. The single UPDATE ... WHERE guard below matches zero rows
// (and so skips the write and the trigger entirely) when the existing
// timestamp is already fresh, rather than reading first to decide.
const PRESENCE_THROTTLE_MS = 60_000;

async function touchPresence(effectiveUserId: string, isImpersonating: boolean) {
  if (isImpersonating) return;
  const supabase = await createClient();
  const staleCutoff = new Date(Date.now() - PRESENCE_THROTTLE_MS).toISOString();
  await supabase
    .from("profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", effectiveUserId)
    .or(`last_active_at.is.null,last_active_at.lt.${staleCutoff}`);
}

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const view = await requireViewContext("student");
  const { isImpersonating, targetName } = view;

  const [, { data: profile }] = await Promise.all([
    touchPresence(view.effectiveUserId, isImpersonating),
    createClient().then((supabase) => supabase.from("profiles").select("full_name").eq("id", view.effectiveUserId).maybeSingle()),
  ]);
  const fullName = profile?.full_name ?? null;
  const announcements = isImpersonating ? [] : await fetchStudentAnnouncements(view.effectiveUserId);
  // get_daily_stopwatch_ranking() resolves auth.uid() from the real
  // session, not the impersonated target -- there's no "effective user"
  // override for a security-definer function the way a plain query gets
  // one, so calling it while impersonating would return the ADMIN's own
  // (nonexistent) ranking rather than the student being viewed. Skipped
  // for the same reason announcements is above.
  const ranking = isImpersonating ? EMPTY_RANKING : await getDailyStopwatchRanking();

  return (
    <div className="flex flex-1 flex-col">
      {isImpersonating && (
        <>
          <ImpersonationBanner targetName={targetName ?? "kullanıcı"} />
          <ImpersonationLockStyles />
        </>
      )}
      <DashboardShell sidebar={<StudentSidebar fullName={fullName} />}>
        {isImpersonating ? <fieldset disabled className="contents">{children}</fieldset> : children}
      </DashboardShell>
      <AnnouncementCenter announcements={announcements} />
      <StopwatchWidget ranking={ranking} />
    </div>
  );
}
