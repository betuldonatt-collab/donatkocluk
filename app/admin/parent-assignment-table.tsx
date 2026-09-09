"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { linkParent, unlinkParent } from "./actions";
import { ResetPasswordButton } from "./_components/reset-password-button";

type Person = { id: string; full_name: string | null };

export function ParentAssignmentTable({
  parents,
  students,
  linksByParent,
}: {
  parents: Person[];
  students: Person[];
  linksByParent: Record<string, string[]>;
}) {
  const [links, setLinks] = useState(linksByParent);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const studentsById = new Map(students.map((s) => [s.id, s]));

  async function handleAdd(parentId: string) {
    const studentId = selected[parentId];
    if (!studentId) return;
    const key = `${parentId}:${studentId}`;
    setSavingKey(key);
    try {
      await linkParent(parentId, studentId);
      setLinks((prev) => ({ ...prev, [parentId]: [...(prev[parentId] ?? []), studentId] }));
      setSelected((prev) => ({ ...prev, [parentId]: "" }));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleRemove(parentId: string, studentId: string) {
    const key = `${parentId}:${studentId}`;
    setSavingKey(key);
    try {
      await unlinkParent(parentId, studentId);
      setLinks((prev) => ({ ...prev, [parentId]: (prev[parentId] ?? []).filter((id) => id !== studentId) }));
    } finally {
      setSavingKey(null);
    }
  }

  if (parents.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıtlı veli yok.</p>;
  }

  const selectClass =
    "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50";

  return (
    <div className="space-y-4">
      {parents.map((parent) => {
        const linkedStudentIds = links[parent.id] ?? [];
        const unlinkedStudents = students.filter((s) => !linkedStudentIds.includes(s.id));
        return (
          <div key={parent.id} className="border-border rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-foreground text-sm font-medium">{parent.full_name ?? "(İsimsiz)"}</p>
              <ResetPasswordButton userId={parent.id} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {linkedStudentIds.map((studentId) => {
                const student = studentsById.get(studentId);
                const key = `${parent.id}:${studentId}`;
                return (
                  <span
                    key={studentId}
                    className="bg-secondary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  >
                    {student?.full_name ?? "(İsimsiz)"}
                    <button
                      type="button"
                      onClick={() => handleRemove(parent.id, studentId)}
                      disabled={savingKey === key}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label="Bağlantıyı kaldır"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
              {unlinkedStudents.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selected[parent.id] ?? ""}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [parent.id]: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Öğrenci seç...</option>
                    {unlinkedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name ?? "(İsimsiz)"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAdd(parent.id)}
                    disabled={!selected[parent.id]}
                    className="text-primary text-xs font-medium underline disabled:opacity-50"
                  >
                    Ekle
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
