"use client";

import { useOptimistic, useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { pauseAutoRefresh, resumeAutoRefresh } from "@/components/auto-refresh";
import { startPerf } from "@/lib/perf-log";
import { setActiveStudent } from "@/lib/parent-context";

// First + last initial, same convention as the coach panel's own student
// directory avatars (app/admin/students/page.tsx) -- there's no photo to
// fall back from here, every avatar is always this initials tile.
function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Only ever rendered when the parent has more than one linked child (see
// ParentLayout) -- a single-child parent never sees this at all, per the
// explicit "hide it to keep the UI clean" requirement.
//
// One-click segmented control (same bg-secondary/rounded-lg pill-toggle
// shape as the TYT/AYT track toggles elsewhere -- e.g. charts-tab.tsx's
// own TrackToggle), not a dropdown: every student is a directly clickable
// tab, no open-then-select step.
export function StudentSwitcher({ students, activeStudentId }: { students: { id: string; full_name: string | null }[]; activeStudentId: string }) {
  const [, startTransition] = useTransition();
  // Instant visual switch: the clicked tab highlights the moment it's
  // clicked, independent of how long the setActiveStudent cookie write and
  // router.refresh() actually take. React reverts this back to the real
  // `activeStudentId` prop on its own once the transition settles and this
  // component re-renders with the refreshed value -- the server call and
  // layout refresh genuinely happen, just quietly, with nothing in the UI
  // waiting on them.
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic(activeStudentId);

  function handleSelect(studentId: string) {
    if (studentId === optimisticActiveId) return;
    // Keep the 20 s auto-refresh out of the way while the switch is in flight, and
    // time the whole thing in the browser (compare with the server's "[perf]" logs).
    pauseAutoRefresh();
    const clientStart = startPerf();
    startTransition(async () => {
      setOptimisticActiveId(studentId);
      // The action revalidates the parent tree itself (lib/parent-context.ts).
      try {
        await setActiveStudent(studentId);
      } finally {
        resumeAutoRefresh();
        console.log(`[perf] student switch (browser, click -> new page ready) ${Math.round(startPerf() - clientStart)}ms`);
      }
    });
  }

  return (
    <div className="border-border bg-muted/30 flex items-center gap-2 border-b px-4 py-2 sm:px-6 lg:px-8">
      <span className="text-muted-foreground shrink-0 text-xs font-medium">Öğrenci:</span>
      <div className="bg-secondary inline-flex flex-wrap items-center gap-1 rounded-lg p-1">
        {students.map((s) => {
          const active = s.id === optimisticActiveId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Avatar className="size-5">
                <AvatarFallback
                  className={cn(
                    "text-[10px] font-semibold",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground",
                  )}
                >
                  {initialsOf(s.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate">{s.full_name ?? "(İsimsiz)"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
