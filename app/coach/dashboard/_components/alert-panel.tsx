import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Megaphone, TrendingDown } from "lucide-react";

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

// One column of the RSVP status card below -- own header, own "Yok" empty
// state. No item cap and no "+N daha" truncation: the list itself scrolls
// (max-h-48 + thin-scrollbar, app/globals.css) once it outgrows the card, so
// every name stays one scroll away instead of getting hidden behind a count.
function RsvpColumn({ heading, items }: { heading: string; items: Item[] }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
        {heading} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">Yok</p>
      ) : (
        <div className="thin-scrollbar max-h-48 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href ?? `/coach/students/${item.studentId}`}
              className="hover:bg-accent/40 block truncate rounded px-1.5 py-1 text-xs"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// A student's RSVP status across every active announcement, split into three
// side-by-side columns -- Katılacaklar (attending), Katılmayacaklar (not
// attending), and Cevap Bekleyenler (no response yet) -- rather than a
// single "who declined" list, so a coach can see the whole participation
// picture for one announcement at a glance. Spans the full grid width (see
// the className below) since three independently-scrollable name lists need
// more room than a quarter-width alert card.
function RsvpStatusCard({ attending, notAttending, pending }: { attending: Item[]; notAttending: Item[]; pending: Item[] }) {
  return (
    <Card className="sm:col-span-2 lg:col-span-4">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Megaphone className="text-muted-foreground size-4" />
        <CardTitle className="text-sm">Duyuru Katılım Durumu</CardTitle>
      </CardHeader>
      <CardContent>
        {attending.length === 0 && notAttending.length === 0 && pending.length === 0 ? (
          <p className="text-muted-foreground text-xs">Yok</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RsvpColumn heading="Katılacaklar" items={attending} />
            <RsvpColumn heading="Katılmayacaklar" items={notAttending} />
            <RsvpColumn heading="Cevap Bekleyenler" items={pending} />
          </div>
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
    alerts.pendingReportCards.length +
    alerts.rsvpAttending.length +
    alerts.rsvpNotAttending.length +
    alerts.rsvpPending.length +
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
      <PendingFocusReviewsPanel reviews={focusReviews} />
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
      <RsvpStatusCard
        attending={alerts.rsvpAttending.map((a) => ({
          key: a.rsvpId,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — ${a.announcementTitle}`,
        }))}
        notAttending={alerts.rsvpNotAttending.map((a) => ({
          key: a.rsvpId,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — ${a.announcementTitle}${a.declineReason ? `: ${a.declineReason}` : ""}`,
        }))}
        pending={alerts.rsvpPending.map((a) => ({
          key: a.rsvpId,
          studentId: a.student.id,
          label: `${a.student.full_name ?? "İsimsiz Öğrenci"} — ${a.announcementTitle}`,
        }))}
      />
      <PendingApprovalsPanel title="YKS Onay Bekleyen Görevler" tasks={pendingApprovals.filter((t) => t.studentExamType !== "LGS")} />
      <PendingApprovalsPanel title="LGS Onay Bekleyen Görevler" tasks={pendingApprovals.filter((t) => t.studentExamType === "LGS")} />
    </div>
  );
}
