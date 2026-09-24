"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { linkParent, unlinkParent } from "../actions";
import { ResetPasswordButton } from "../_components/reset-password-button";

type Person = { id: string; full_name: string | null };

// Student-centric: one row per STUDENT, each showing every currently
// linked parent as a removable chip plus an "add another parent"
// picker -- neither adding nor removing a link ever touches any other
// link, since parent_students has no unique constraint on student_id
// (only on the (parent_id, student_id) PAIR, see migration 0026's own
// header comment) and linkParent/unlinkParent only ever insert/delete
// that one row. A student can end up with several parent chips (mother +
// father, ...) and the same parent can appear under several different
// students' rows (siblings) -- both directions were already fully
// supported by the schema and these same two actions; this component is
// just the UI that makes adding a SECOND parent to an already-linked
// student actually reachable, instead of only ever showing one.
function StudentParentAssignments({
  students,
  parents,
  linksByStudent,
  onLink,
  onUnlink,
}: {
  students: Person[];
  parents: Person[];
  linksByStudent: Record<string, string[]>;
  onLink: (studentId: string, parentId: string) => Promise<void>;
  onUnlink: (studentId: string, parentId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const parentsById = new Map(parents.map((p) => [p.id, p]));

  async function handleAdd(studentId: string) {
    const parentId = selected[studentId];
    if (!parentId) return;
    const key = `${studentId}:${parentId}`;
    setSavingKey(key);
    try {
      await onLink(studentId, parentId);
      setSelected((prev) => ({ ...prev, [studentId]: "" }));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleRemove(studentId: string, parentId: string) {
    const key = `${studentId}:${parentId}`;
    setSavingKey(key);
    try {
      await onUnlink(studentId, parentId);
    } finally {
      setSavingKey(null);
    }
  }

  if (students.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıtlı öğrenci yok.</p>;
  }

  const selectClass =
    "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-10 md:h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50";

  return (
    <div className="space-y-4">
      {students.map((student) => {
        const linkedParentIds = linksByStudent[student.id] ?? [];
        const unlinkedParents = parents.filter((p) => !linkedParentIds.includes(p.id));
        return (
          <div key={student.id} className="border-border rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">{student.full_name ?? "(İsimsiz)"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {linkedParentIds.length === 0 && (
                <span className="text-muted-foreground text-xs">Henüz veli eşleştirilmedi.</span>
              )}
              {linkedParentIds.map((parentId) => {
                const parent = parentsById.get(parentId);
                const key = `${student.id}:${parentId}`;
                return (
                  <span
                    key={parentId}
                    className="bg-secondary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  >
                    {parent?.full_name ?? "(İsimsiz)"}
                    <button
                      type="button"
                      onClick={() => handleRemove(student.id, parentId)}
                      disabled={savingKey === key}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label="Bağlantıyı kaldır"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
              {unlinkedParents.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selected[student.id] ?? ""}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [student.id]: e.target.value }))}
                    className={selectClass}
                    aria-label={`${student.full_name ?? "Öğrenci"} için veli seç`}
                  >
                    <option value="">Veli seç...</option>
                    {unlinkedParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? "(İsimsiz)"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAdd(student.id)}
                    disabled={!selected[student.id] || savingKey !== null}
                    className="text-primary text-xs font-medium underline disabled:opacity-50"
                  >
                    {linkedParentIds.length > 0 ? "Başka veli ekle" : "Ekle"}
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

// Plain roster with just a name + "Şifreyi Sıfırla" -- the one thing a
// parent CHIP above (repeated once per linked student) has no natural
// place for, so it lives here once per parent instead.
function ParentRoster({ parents }: { parents: Person[] }) {
  if (parents.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz kayıtlı veli yok.</p>;
  }
  return (
    <div className="flex flex-wrap gap-3">
      {parents.map((parent) => (
        <div key={parent.id} className="border-border flex items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-foreground text-sm font-medium">{parent.full_name ?? "(İsimsiz)"}</span>
          <ResetPasswordButton userId={parent.id} />
        </div>
      ))}
    </div>
  );
}

export function ParentAssignmentTable({
  parents,
  students,
  linksByParent,
}: {
  parents: Person[];
  students: Person[];
  // parent_id -> student_id[], as fetched -- flipped to student-centric
  // locally since that's the orientation the UI below actually needs.
  linksByParent: Record<string, string[]>;
}) {
  const [linksByStudent, setLinksByStudent] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const [parentId, studentIds] of Object.entries(linksByParent)) {
      for (const studentId of studentIds) (out[studentId] ??= []).push(parentId);
    }
    return out;
  });

  async function handleLink(studentId: string, parentId: string) {
    await linkParent(parentId, studentId);
    setLinksByStudent((prev) => ({ ...prev, [studentId]: [...(prev[studentId] ?? []), parentId] }));
  }

  async function handleUnlink(studentId: string, parentId: string) {
    await unlinkParent(parentId, studentId);
    setLinksByStudent((prev) => ({ ...prev, [studentId]: (prev[studentId] ?? []).filter((id) => id !== parentId) }));
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-foreground text-sm font-semibold tracking-wide uppercase">Veliler</h3>
        <p className="text-muted-foreground mb-3 text-xs">Şifre sıfırlama burada, öğrenci eşleştirmeleri aşağıda.</p>
        <ParentRoster parents={parents} />
      </section>

      <section>
        <h3 className="text-foreground text-sm font-semibold tracking-wide uppercase">Öğrenci - Veli Eşleştirmeleri</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Bir öğrenciye birden fazla veli (anne + baba gibi) eklenebilir; aynı veli birden fazla öğrenciyle
          (kardeşler) eşleştirilebilir.
        </p>
        <StudentParentAssignments
          students={students}
          parents={parents}
          linksByStudent={linksByStudent}
          onLink={handleLink}
          onUnlink={handleUnlink}
        />
      </section>
    </div>
  );
}
