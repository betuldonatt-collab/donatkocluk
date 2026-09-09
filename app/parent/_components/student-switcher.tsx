"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { setActiveStudent } from "@/lib/parent-context";
import type { LinkedStudent } from "@/lib/parent-context";

// Only ever rendered when the parent has more than one linked child (see
// ParentLayout) -- a single-child parent never sees this at all, per the
// explicit "hide it to keep the UI clean" requirement.
export function StudentSwitcher({ students, activeStudentId }: { students: LinkedStudent[]; activeStudentId: string }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleChange(studentId: string) {
    if (studentId === activeStudentId) return;
    setSwitching(true);
    try {
      await setActiveStudent(studentId);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 flex items-center gap-2 border-b px-4 py-2 sm:px-6 lg:px-8">
      <Users className="text-muted-foreground size-4 shrink-0" />
      <label className="text-muted-foreground text-xs font-medium">Öğrenci:</label>
      <select
        value={activeStudentId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={switching}
        className="border-input bg-background h-8 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
      >
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name ?? "(İsimsiz)"}
          </option>
        ))}
      </select>
    </div>
  );
}
