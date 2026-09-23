import Link from "next/link";
import { AlertTriangle, CalendarX, ClipboardCheck, MessageSquareX, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PendingFocusReview, PendingStudentTask } from "../../actions";
import type { CoachAlerts } from "../types";
import { MissingExamAnalysisPanel } from "./missing-exam-analysis-panel";
import { PendingApprovalsPanel } from "./pending-approvals-panel";
import { PendingFocusReviewsPanel } from "./pending-focus-reviews-panel";

type Item = { key: string; studentId: string; label: string; href?: string };

function AlertCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof AlertTriangle;
  title: string;
  items: Item[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="text-muted-foreground size-4" />
        <CardTitle className="text-sm">
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-xs">Yok</p>
        ) : (
          <>
            {items.slice(0, 6).map((item) => (
              <Link
                key={item.key}
                href={item.href ?? `/coach/students/${item.studentId}`}
                className="hover:bg-accent/40 block truncate rounded px-1.5 py-1 text-xs"
              >
                {item.label}
              </Link>
            ))}
            {items.length > 6 && <p className="text-muted-foreground px-1.5 text-xs">+{items.length - 6} daha</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AlertPanel({
  alerts,
  pendingApprovals,
  focusReviews,
}: {
  alerts: CoachAlerts;
  pendingApprovals: (PendingStudentTask & { studentId: string; studentName: string | null })[];
  focusReviews: PendingFocusReview[];
}) {
  const totalAlerts =
    alerts.inactive.length +
    alerts.lowPerformance.length +
    alerts.missingExams.length +
    alerts.emptyPrograms.length +
    alerts.pendingReportCards.length +
    alerts.rsvpDeclines.length +
    pendingApprovals.length +
    focusReviews.length;

  if (totalAlerts === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-4 text-center text-sm">
          Şu an dikkat gerektiren bir durum yok.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AlertCard
        icon={AlertTriangle}
        title="Pasif Öğrenciler"
        items={alerts.inactive.map((a) => ({
          key: a.student.id,
          studentId: a.student.id,
          label: a.student.full_name ?? "İsimsiz Öğrenci",
        }))}
      />
      <AlertCard
        icon={TrendingDown}
        title="Düşük Performans"
        items={alerts.lowPerformance.map((a) => ({
          key: a.student.id,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — %${a.completionPct}`,
        }))}
      />
      <MissingExamAnalysisPanel alerts={alerts.missingExams} />
      <AlertCard
        icon={CalendarX}
        title="Boş Program"
        items={alerts.emptyPrograms.map((a) => ({
          key: a.student.id,
          studentId: a.student.id,
          label: a.student.full_name ?? "İsimsiz Öğrenci",
        }))}
      />
      <AlertCard
        icon={ClipboardCheck}
        title="Onay Bekleyen Karneler"
        items={alerts.pendingReportCards.map((a) => ({
          key: a.reportCardId,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — ${a.cycleNumber}. Dönem`,
          href: `/coach/students/${a.student.id}?tab=karneler`,
        }))}
      />
      <AlertCard
        icon={MessageSquareX}
        title="Katılmayacak Öğrenciler"
        items={alerts.rsvpDeclines.map((a) => ({
          key: a.rsvpId,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — ${a.announcementTitle}${a.declineReason ? `: ${a.declineReason}` : ""}`,
        }))}
      />
      <PendingApprovalsPanel tasks={pendingApprovals} />
      <PendingFocusReviewsPanel reviews={focusReviews} />
    </div>
  );
}
