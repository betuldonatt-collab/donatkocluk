"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, RsvpResponse } from "@/lib/event-attendance";
import { AttendanceDialog } from "./attendance-dialog";

export type { AttendanceStatus };

export type EventStudentRow = {
  studentId: string;
  studentName: string;
  declineReason: string | null;
  // The marks saved so far: session number -> status (a session with no entry is not marked yet).
  marks: Record<number, AttendanceStatus>;
};

export type EventData = {
  id: string;
  title: string;
  eventDate: string | null;
  eventTime: string | null;
  // How many sessions the event has, once a coach has said so (null = not asked yet).
  sessionCount: number | null;
  attending: EventStudentRow[];
  notAttending: EventStudentRow[];
  pending: EventStudentRow[];
};

function formatEventDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// One small dot per session: green = Geldi, red = Gelmedi, grey = not marked.
export function SessionDots({ marks, sessionCount }: { marks: Record<number, AttendanceStatus>; sessionCount: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="Oturum yoklamaları">
      {Array.from({ length: sessionCount }, (_, i) => i + 1).map((n) => {
        const status = marks[n];
        return (
          <span
            key={n}
            title={`${n}. oturum: ${status === "attended" ? "Geldi" : status === "not_attended" ? "Gelmedi" : "işaretlenmedi"}`}
            className={cn(
              "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
              status === "attended"
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-700"
                : status === "not_attended"
                  ? "border-rose-500 bg-rose-500/15 text-rose-700"
                  : "border-border text-muted-foreground",
            )}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

function EventColumn({ heading, rows, sessionCount, showDeclineReason }: { heading: string; rows: EventStudentRow[]; sessionCount: number | null; showDeclineReason: boolean }) {
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
                {showDeclineReason && row.declineReason && <p className="text-muted-foreground truncate text-xs">{row.declineReason}</p>}
              </div>
              {sessionCount !== null && <SessionDots marks={row.marks} sessionCount={sessionCount} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One card per active, RSVP-required announcement -- the three-column Katılacaklar/Katılmayacaklar/Cevap Bekleyenler breakdown
// across the coach's roster, and the "Yoklama Al" button: it asks how many sessions the event has, then opens the Geldi / Gelmedi
// checklist (attendance-dialog.tsx). Each name shows one dot per session once a roll call exists.
export function EventAttendanceSection({ event }: { event: EventData }) {
  const [data, setData] = useState(event);
  const [open, setOpen] = useState(false);

  const students = [
    ...data.attending.map((r) => ({ row: r, rsvp: "attending" as RsvpResponse | null })),
    ...data.notAttending.map((r) => ({ row: r, rsvp: "not_attending" as RsvpResponse | null })),
    ...data.pending.map((r) => ({ row: r, rsvp: null as RsvpResponse | null })),
  ].map(({ row, rsvp }) => ({ studentId: row.studentId, studentName: row.studentName, rsvp, marks: row.marks }));

  function handleSaved(sessionCount: number, marksByStudent: Record<string, Record<number, AttendanceStatus>>) {
    const apply = (rows: EventStudentRow[]) => rows.map((r) => ({ ...r, marks: marksByStudent[r.studentId] ?? r.marks }));
    setData((prev) => ({ ...prev, sessionCount, attending: apply(prev.attending), notAttending: apply(prev.notAttending), pending: apply(prev.pending) }));
  }

  const hasStudents = students.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{data.title}</CardTitle>
          {data.eventDate && (
            <p className="text-muted-foreground text-xs">
              {formatEventDate(data.eventDate)}
              {data.eventTime && ` — ${data.eventTime.slice(0, 5)}`}
              {data.sessionCount !== null && ` · ${data.sessionCount} oturum`}
            </p>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" disabled={!hasStudents} onClick={() => setOpen(true)}>
          <ClipboardCheck className="size-4" />
          {data.sessionCount === null ? "Yoklama Al" : "Yoklamayı Düzenle"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <EventColumn heading="Katılacaklar" rows={data.attending} sessionCount={data.sessionCount} showDeclineReason={false} />
          <EventColumn heading="Katılmayacaklar" rows={data.notAttending} sessionCount={data.sessionCount} showDeclineReason />
          <EventColumn heading="Cevap Bekleyenler" rows={data.pending} sessionCount={data.sessionCount} showDeclineReason={false} />
        </div>
      </CardContent>

      <AttendanceDialog
        open={open}
        onOpenChange={setOpen}
        eventId={data.id}
        eventTitle={data.title}
        savedSessionCount={data.sessionCount}
        students={students}
        onSaved={handleSaved}
      />
    </Card>
  );
}
