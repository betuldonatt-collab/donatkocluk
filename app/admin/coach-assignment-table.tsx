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
import { assignCoach } from "./actions";

type Person = { id: string; full_name: string | null };

export function CoachAssignmentTable({
  students,
  coaches,
  assignedCoachByStudent,
}: {
  students: Person[];
  coaches: Person[];
  assignedCoachByStudent: Record<string, string>;
}) {
  const [assignments, setAssignments] = useState(assignedCoachByStudent);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  if (students.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıtlı öğrenci yok.</p>;
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Öğrenci</TableHead>
            <TableHead>Koç</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.id}>
              <TableCell className="font-medium">{student.full_name ?? "(İsimsiz)"}</TableCell>
              <TableCell>
                <select
                  value={assignments[student.id] ?? ""}
                  onChange={(e) => handleChange(student.id, e.target.value)}
                  disabled={savingId === student.id}
                  className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
                >
                  <option value="">Atanmadı</option>
                  {coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.full_name ?? "(İsimsiz)"}
                    </option>
                  ))}
                </select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
