"use client";

import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXIT_CATEGORY_LABELS, type ExitCategory } from "@/lib/exit-category";
import { assignCoach, setStudentStatus, updateSessionQuota } from "./actions";

type Person = { id: string; full_name: string | null };
type CoachRow = Person & { activeCount: number; maxStudents: number };
type StudentRow = Person & {
  is_active: boolean;
  exit_category: ExitCategory | null;
  exit_note: string | null;
  total_session_quota: number;
};
type StatusState = { isActive: boolean; exitCategory: ExitCategory | ""; exitNote: string };

export function CoachAssignmentTable({
  students,
  coaches,
  assignedCoachByStudent,
  completedCountByStudent,
}: {
  students: StudentRow[];
  coaches: CoachRow[];
  assignedCoachByStudent: Record<string, string>;
  // Live count of outcome='completed' coaching_sessions per student --
  // never a manual "used" input; the only thing an admin actually edits
  // here is the target quota itself.
  completedCountByStudent: Record<string, number>;
}) {
  const [assignments, setAssignments] = useState(assignedCoachByStudent);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusState>>(() =>
    Object.fromEntries(
      students.map((s) => [
        s.id,
        { isActive: s.is_active, exitCategory: s.exit_category ?? "", exitNote: s.exit_note ?? "" },
      ]),
    ),
  );
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, String(s.total_session_quota)])),
  );
  const [quotaSavingId, setQuotaSavingId] = useState<string | null>(null);

  async function handleQuotaBlur(studentId: string) {
    const value = Math.max(0, Number(quotas[studentId]) || 0);
    setQuotas((prev) => ({ ...prev, [studentId]: String(value) }));
    setQuotaSavingId(studentId);
    try {
      await updateSessionQuota(studentId, value);
    } finally {
      setQuotaSavingId(null);
    }
  }

  async function handleChange(studentId: string, value: string) {
    const nextCoachId = value === "" ? null : value;
    setSavingId(studentId);
    setAssignments((prev) => {
      const next = { ...prev };
      if (nextCoachId === null) delete next[studentId];
      else next[studentId] = nextCoachId;
      return next;
    });
    try {
      await assignCoach(studentId, nextCoachId);
    } finally {
      setSavingId(null);
    }
  }

  function updateStatusField(studentId: string, patch: Partial<StatusState>) {
    setStatuses((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  async function saveStatus(studentId: string) {
    const s = statuses[studentId];
    setStatusSavingId(studentId);
    try {
      await setStudentStatus(studentId, s.isActive, s.isActive ? null : s.exitCategory || null, s.isActive ? null : s.exitNote.trim() || null);
    } finally {
      setStatusSavingId(null);
    }
  }

  async function handleActiveChange(studentId: string, value: string) {
    const isActive = value === "active";
    updateStatusField(studentId, { isActive });
    setStatusSavingId(studentId);
    try {
      const s = statuses[studentId];
      await setStudentStatus(studentId, isActive, isActive ? null : s.exitCategory || null, isActive ? null : s.exitNote.trim() || null);
    } finally {
      setStatusSavingId(null);
    }
  }

  if (students.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıtlı öğrenci yok.</p>;
  }

  const selectClass =
    "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50";

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Öğrenci</TableHead>
            <TableHead>Koç</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead>Görüşme Kotası</TableHead>
            <TableHead>Ayrılış Nedeni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => {
            const status = statuses[student.id];
            return (
              <TableRow key={student.id}>
                <TableCell className="font-medium">{student.full_name ?? "(İsimsiz)"}</TableCell>
                <TableCell>
                  <select
                    value={assignments[student.id] ?? ""}
                    onChange={(e) => handleChange(student.id, e.target.value)}
                    disabled={savingId === student.id}
                    className={selectClass}
                  >
                    <option value="">Atanmadı</option>
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.full_name ?? "(İsimsiz)"} — Aktif: {coach.activeCount}/{coach.maxStudents} Öğrenci
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <select
                    value={status.isActive ? "active" : "inactive"}
                    onChange={(e) => handleActiveChange(student.id, e.target.value)}
                    disabled={statusSavingId === student.id}
                    className={selectClass}
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Ayrıldı</option>
                  </select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        (completedCountByStudent[student.id] ?? 0) >= Number(quotas[student.id])
                          ? "text-rose-600 text-sm font-semibold tabular-nums"
                          : "text-muted-foreground text-sm tabular-nums"
                      }
                    >
                      {completedCountByStudent[student.id] ?? 0}
                    </span>
                    <span className="text-muted-foreground text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      value={quotas[student.id]}
                      onChange={(e) => setQuotas((prev) => ({ ...prev, [student.id]: e.target.value }))}
                      onBlur={() => handleQuotaBlur(student.id)}
                      disabled={quotaSavingId === student.id}
                      aria-label={`${student.full_name ?? "Öğrenci"} görüşme kotası`}
                      className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-16 rounded-md border bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {status.isActive ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={status.exitCategory}
                        onChange={(e) =>
                          updateStatusField(student.id, { exitCategory: e.target.value as ExitCategory | "" })
                        }
                        disabled={statusSavingId === student.id}
                        className={selectClass}
                      >
                        <option value="">Neden seç...</option>
                        {(Object.keys(EXIT_CATEGORY_LABELS) as ExitCategory[]).map((key) => (
                          <option key={key} value={key}>
                            {EXIT_CATEGORY_LABELS[key]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={status.exitNote}
                        onChange={(e) => updateStatusField(student.id, { exitNote: e.target.value })}
                        placeholder="Not (opsiyonel)"
                        className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-40 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
                        disabled={statusSavingId === student.id}
                      />
                      <button
                        type="button"
                        onClick={() => saveStatus(student.id)}
                        disabled={statusSavingId === student.id}
                        className="text-primary text-xs font-medium underline disabled:opacity-50"
                      >
                        Kaydet
                      </button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
