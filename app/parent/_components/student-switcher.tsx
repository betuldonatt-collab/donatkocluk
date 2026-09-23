"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setActiveStudent } from "@/lib/parent-context";
import type { LinkedStudent } from "@/lib/parent-context";

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
export function StudentSwitcher({ students, activeStudentId }: { students: LinkedStudent[]; activeStudentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeStudent = students.find((s) => s.id === activeStudentId) ?? students[0];

  function handleSelect(studentId: string) {
    if (studentId === activeStudentId || isPending) return;
    // startTransition (not a plain await) is what actually fixes the
    // "freezes when switching" report -- setActiveStudent + router.refresh()
    // re-fetch and re-render the whole route tree, and doing that as a
    // normal, un-transitioned update blocks React from keeping the CURRENT
    // page interactive while it's pending, which is exactly what read as a
    // frozen browser tab. Wrapped in a transition, the update is
    // interruptible and low-priority: the dropdown closes immediately, the
    // trigger shows a pending state, and the rest of the page stays
    // clickable/scrollable the whole time the refresh is in flight.
    startTransition(async () => {
      await setActiveStudent(studentId);
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-muted/30 flex items-center border-b px-4 py-2 sm:px-6 lg:px-8">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isPending}
          className={cn(
            "hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-2 rounded-md py-1.5 pr-2 pl-1.5 text-left transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-wait disabled:opacity-70",
          )}
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-semibold">
              {initialsOf(activeStudent?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              {isPending ? "Geçiliyor…" : "Öğrenci"}
            </span>
            <span className="text-foreground max-w-40 truncate text-sm font-semibold">
              {activeStudent?.full_name ?? "(İsimsiz)"}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground ml-0.5 size-3.5 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>Öğrenci Seç</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {students.map((s) => {
            const active = s.id === activeStudentId;
            return (
              <DropdownMenuItem key={s.id} onSelect={() => handleSelect(s.id)} className="gap-2.5 py-2">
                <Avatar className="size-7">
                  <AvatarFallback
                    className={cn(
                      "text-[11px] font-semibold",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {initialsOf(s.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className={cn("flex-1 truncate text-sm", active ? "text-foreground font-medium" : "text-foreground")}>
                  {s.full_name ?? "(İsimsiz)"}
                </span>
                {active && <Check className="text-primary size-4 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
