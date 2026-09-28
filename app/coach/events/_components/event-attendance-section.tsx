"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { clearAnnouncementAttendance, upsertAnnouncementAttendance } from "../../actions";

export type AttendanceStatus = "attended" | "not_attended";

export type EventStudentRow = {
  studentId: string;
  studentName: string;
  declineReason: string | null;
  actualAttendance: AttendanceStatus | null;
};

export type EventData = {
  id: string;
  title: string;
  eventDate: string | null;
  eventTime: string | null;
  attending: EventStudentRow[];
  notAttending: EventStudentRow[];
  pending: EventStudentRow[];
};

function formatEventDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// Katıldı/Katılmadı toggle -- clicking the already-active state clears it
// back to "not yet marked" (see clearAnnouncementAttendance's own comment).
function AttendanceToggle({
  announcementId,
  row,
  onChanged,
}: {
  announcementId: string;
  row: EventStudentRow;
  onChanged: (studentId: string, status: AttendanceStatus | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(next: AttendanceStatus) {
    const nextValue = row.actualAttendance === next ? null : next;
    const prevValue = row.actualAttendance;
    onChanged(row.studentId, nextValue);
    startTransition(async () => {
      try {
        if (nextValue === null) await clearAnnouncementAttendance(announcementId, row.studentId);
        else await upsertAnnouncementAttendance(announcementId, row.studentId, nextValue);
      } catch (e) {
        onChanged(row.studentId, prevValue);
        toast.error(e instanceof Error ? e.message : "Yoklama kaydedilemedi.");
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => setStatus("attended")}
        aria-label="Katıldı"
        title="Katıldı"
        className={cn(
          "flex size-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          row.actualAttendance === "attended"
            ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
            : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600",
        )}
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setStatus("not_attended")}
        aria-label="Katılmadı"
        title="Katılmadı"
        className={cn(
          "flex size-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          row.actualAttendance === "not_attended"
            ? "border-rose-500 bg-rose-500/15 text-rose-600"
            : "border-border text-muted-foreground hover:border-rose-500 hover:text-rose-600",
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function EventColumn({
  heading,
  rows,
  announcementId,
  onChanged,
  showDeclineReason,
}: {
  heading: string;
  rows: EventStudentRow[];
  announcementId: string;
  onChanged: (studentId: string, status: AttendanceStatus | null) => void;
  showDeclineReason: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
        {heading} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">Yok</p>
      ) : (
        <div className="thin-scrollbar max-h-96 space-y-0.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.studentId} className="hover:bg-accent/40 flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm">{row.studentName}</p>
                {showDeclineReason && row.declineReason && (
                  <p className="text-muted-foreground truncate text-xs">{row.declineReason}</p>
                )}
              </div>
              <AttendanceToggle announcementId={announcementId} row={row} onChanged={onChanged} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One card per active, RSVP-required announcement -- the three-column
// Katılacaklar/Katılmayacaklar/Cevap Bekleyenler breakdown, each name paired
// with a Katıldı/Katılmadı toggle so the coach can record attendance right
// where they're already looking at who said they would (or wouldn't) come.
export function EventAttendanceSection({ event }: { event: EventData }) {
  const [rows, setRows] = useState(event);

  function handleChanged(studentId: string, status: AttendanceStatus | null) {
    setRows((prev) => ({
      ...prev,
      attending: prev.attending.map((r) => (r.studentId === studentId ? { ...r, actualAttendance: status } : r)),
      notAttending: prev.notAttending.map((r) => (r.studentId === studentId ? { ...r, actualAttendance: status } : r)),
      pending: prev.pending.map((r) => (r.studentId === studentId ? { ...r, actualAttendance: status } : r)),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rows.title}</CardTitle>
        {rows.eventDate && (
          <p className="text-muted-foreground text-xs">
            {formatEventDate(rows.eventDate)}
            {rows.eventTime && ` — ${rows.eventTime.slice(0, 5)}`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <EventColumn heading="Katılacaklar" rows={rows.attending} announcementId={rows.id} onChanged={handleChanged} showDeclineReason={false} />
          <EventColumn heading="Katılmayacaklar" rows={rows.notAttending} announcementId={rows.id} onChanged={handleChanged} showDeclineReason />
          <EventColumn heading="Cevap Bekleyenler" rows={rows.pending} announcementId={rows.id} onChanged={handleChanged} showDeclineReason={false} />
        </div>
      </CardContent>
    </Card>
  );
}
