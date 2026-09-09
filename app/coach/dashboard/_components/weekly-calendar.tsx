"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  PX_PER_HOUR,
  RANGE_END_HOUR,
  RANGE_START_HOUR,
  formatTime,
  heightPx,
  snapToSlot,
  topPx,
} from "./calendar-constants";
import { BlockDetailDialog, CreateEventDialog, SessionDetailDialog } from "./event-dialogs";
import { layoutDayEvents } from "./event-layout";
import type { CalendarBlock, CoachingSession, RosterStudent } from "../types";

const SESSION_DURATION_MS = 45 * 60000;

const HOURS = Array.from({ length: RANGE_END_HOUR - RANGE_START_HOUR }, (_, i) => RANGE_START_HOUR + i);

export function WeeklyCalendar({
  weekDays,
  today,
  sessions,
  blocks,
  roster,
  onCreatedSession,
  onCreatedBlock,
  onDeletedSession,
  onDeletedBlock,
}: {
  weekDays: { date: string; label: string }[];
  today: string;
  sessions: CoachingSession[];
  blocks: CalendarBlock[];
  roster: RosterStudent[];
  onCreatedSession: (session: CoachingSession) => void;
  onCreatedBlock: (block: CalendarBlock) => void;
  onDeletedSession: (id: string) => void;
  onDeletedBlock: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState({ date: today, hour: RANGE_START_HOUR, minute: 0 });
  // CreateEventDialog keeps its own uncontrolled date/time/title state
  // internally; bumping this on every click forces a remount so a new
  // click's defaults actually take effect instead of reusing whatever
  // the dialog's state happened to be from the last time it was opened.
  const [createSeq, setCreateSeq] = useState(0);
  const [activeSession, setActiveSession] = useState<CoachingSession | null>(null);
  const [activeBlock, setActiveBlock] = useState<CalendarBlock | null>(null);

  function handleColumnClick(dayDate: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { hour, minute } = snapToSlot(e.clientY - rect.top);
    setCreateDefaults({ date: dayDate, hour, minute });
    setCreateSeq((n) => n + 1);
    setCreateOpen(true);
  }

  const gridHeight = (RANGE_END_HOUR - RANGE_START_HOUR) * PX_PER_HOUR;

  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <div className="grid min-w-[900px] grid-cols-[56px_repeat(7,1fr)]">
        <div className="border-border border-b" />
        {weekDays.map((day) => (
          <div
            key={day.date}
            className={cn(
              "border-border border-b border-l px-2 py-2 text-center text-xs font-semibold",
              day.date === today ? "bg-primary/5 text-primary" : "text-foreground",
            )}
          >
            {day.label}
          </div>
        ))}

        <div className="relative" style={{ height: gridHeight }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="text-muted-foreground border-border absolute right-1 -translate-y-2 border-t pt-0.5 text-[10px]"
              style={{ top: (hour - RANGE_START_HOUR) * PX_PER_HOUR, left: 0, right: 4 }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {weekDays.map((day) => {
          const daySessions = sessions.filter((s) => s.scheduled_at.slice(0, 10) === day.date);
          const dayBlocks = blocks.filter((b) => b.start_at.slice(0, 10) === day.date);

          const layout = layoutDayEvents([
            ...daySessions.map((s) => ({
              id: s.id,
              startMs: new Date(s.scheduled_at).getTime(),
              endMs: new Date(s.scheduled_at).getTime() + SESSION_DURATION_MS,
            })),
            ...dayBlocks.map((b) => ({
              id: b.id,
              startMs: new Date(b.start_at).getTime(),
              endMs: new Date(b.end_at).getTime(),
            })),
          ]);

          function slotStyle(id: string, top: number, height: number): React.CSSProperties {
            const slot = layout.get(id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / slot.cols;
            return {
              top,
              height,
              left: `calc(${slot.col * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
            };
          }

          return (
            <div
              key={day.date}
              className="border-border relative cursor-pointer border-l"
              style={{ height: gridHeight }}
              onClick={(e) => handleColumnClick(day.date, e)}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-border/60 pointer-events-none absolute inset-x-0 border-t"
                  style={{ top: (hour - RANGE_START_HOUR) * PX_PER_HOUR }}
                />
              ))}

              {dayBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  title={`${block.title} — ${formatTime(block.start_at)}–${formatTime(block.end_at)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBlock(block);
                  }}
                  className="bg-muted hover:bg-muted/80 text-muted-foreground absolute overflow-hidden rounded-md border border-dashed px-1.5 py-1 text-left text-[11px] leading-tight"
                  style={slotStyle(block.id, topPx(block.start_at), heightPx(block.start_at, block.end_at))}
                >
                  <span className="block truncate font-medium">{block.title}</span>
                  <span className="block truncate">{formatTime(block.start_at)}</span>
                </button>
              ))}

              {daySessions.map((session) => {
                const student = roster.find((s) => s.id === session.student_id);
                const isMissed = session.outcome === "not_happened";
                const endIso = new Date(new Date(session.scheduled_at).getTime() + SESSION_DURATION_MS).toISOString();
                return (
                  <button
                    key={session.id}
                    type="button"
                    title={`${student?.full_name ?? "Öğrenci"} — ${formatTime(session.scheduled_at)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSession(session);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight text-white",
                      isMissed
                        ? "border-rose-600 bg-rose-500/80 hover:bg-rose-500"
                        : session.outcome === "completed"
                          ? "border-emerald-600 bg-emerald-500/80 hover:bg-emerald-500"
                          : "border-primary bg-primary/85 hover:bg-primary",
                    )}
                    style={slotStyle(session.id, topPx(session.scheduled_at), heightPx(session.scheduled_at, endIso))}
                  >
                    <span className="block truncate font-medium">{student?.full_name ?? "Öğrenci"}</span>
                    <span className="block truncate">{formatTime(session.scheduled_at)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <CreateEventDialog
        key={createSeq}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={createDefaults.date}
        defaultHour={createDefaults.hour}
        defaultMinute={createDefaults.minute}
        roster={roster}
        onCreatedSession={onCreatedSession}
        onCreatedBlock={onCreatedBlock}
      />
      <SessionDetailDialog
        session={activeSession}
        open={!!activeSession}
        onOpenChange={(open) => !open && setActiveSession(null)}
        roster={roster}
        onDeleted={onDeletedSession}
      />
      <BlockDetailDialog
        block={activeBlock}
        open={!!activeBlock}
        onOpenChange={(open) => !open && setActiveBlock(null)}
        onDeleted={onDeletedBlock}
      />
    </div>
  );
}
