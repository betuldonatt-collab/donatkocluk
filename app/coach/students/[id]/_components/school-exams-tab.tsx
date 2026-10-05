"use client";

import { useRef, useState } from "react";
import { Lock, LockOpen, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { friendlyError } from "@/lib/friendly-error";
import {
  buildSchoolCards,
  COHORT_LABELS,
  EXAM_LABELS,
  EXAM_NOS,
  formatGrade,
  gradeCellKey,
  parseGrade,
  schoolColor,
  TERM_LABELS,
  TERMS,
  type ExamNo,
  type SchoolCard,
  type Term,
} from "@/lib/school-exams";
import { cn } from "@/lib/utils";
import { decideCourseRemoval } from "../../../school-exam-actions";
import { saveSchoolGradeForStudent, setSchoolGradeLock } from "../../../school-grade-actions";
import type { CoachSchoolExams } from "../school-exams-data";

// "Yazılılar" on the student's detail page: the school-exam grades per course, per term, per yazılı, in the card
// colours the student picked. The coach edits any grade, LOCKS single grades (a locked grade is read-only for
// the student; an unlocked one stays editable by both) and decides the student's "bu dersi almıyorum" requests
// right on the course's card.
export function SchoolExamsTab({ data, studentId }: { data: CoachSchoolExams; studentId: string }) {
  const [cards, setCards] = useState(() => buildSchoolCards(data.defaults, data.courses, data.grades));

  if (!data.ready) {
    return <p className="text-muted-foreground text-sm">Yazılı notları şu anda gösterilemiyor.</p>;
  }

  const patchCard = (key: string, patch: (c: SchoolCard) => Partial<SchoolCard>) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch(c) } : c)));
  const entered = cards.reduce((sum, c) => sum + Object.keys(c.grades).length, 0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {COHORT_LABELS[data.cohort]} yazılı notları. Notları sen de düzenleyebilirsin; kilit simgesiyle bir notu kilitlersen öğrenci o notu değiştiremez, kilitlemediğin notlar
        ikinizce de düzenlenebilir.
      </p>

      {entered === 0 && (
        <EmptyState icon={NotebookPen} title="Henüz not girilmemiş" description="Öğrenci ya da sen not girdiğinde burada görünecek." />
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {cards.map((card) => (
          <CourseCard
            key={card.key}
            card={card}
            studentId={studentId}
            patchCard={patchCard}
            onRemoved={(key) => setCards((prev) => prev.filter((c) => c.key !== key))}
          />
        ))}
      </div>
    </div>
  );
}

function CourseCard({
  card,
  studentId,
  patchCard,
  onRemoved,
}: {
  card: SchoolCard;
  studentId: string;
  patchCard: (key: string, patch: (c: SchoolCard) => Partial<SchoolCard>) => void;
  onRemoved: (key: string) => void;
}) {
  const color = schoolColor(card.color, card.index);
  const [approveOpen, setApproveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSaveGrade(term: Term, examNo: ExamNo, value: number | null): Promise<boolean> {
    try {
      const res = await saveSchoolGradeForStudent({ studentId, courseKey: card.key, term, examNo, value });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      const cell = gradeCellKey(term, examNo);
      patchCard(card.key, (c) => {
        const grades = { ...c.grades };
        const locks = { ...c.locks };
        if (value === null) {
          delete grades[cell];
          delete locks[cell];
        } else {
          grades[cell] = value;
          if (res.data.locked) locks[cell] = true;
        }
        return { courseId: res.data.courseId, grades, locks };
      });
      return true;
    } catch (e) {
      toast.error(friendlyError(e, "Not kaydedilemedi, tekrar dene."));
      return false;
    }
  }

  async function handleToggleLock(term: Term, examNo: ExamNo) {
    const cell = gradeCellKey(term, examNo);
    const next = !card.locks[cell];
    try {
      const res = await setSchoolGradeLock({ studentId, courseKey: card.key, term, examNo, locked: next });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      patchCard(card.key, (c) => ({ locks: { ...c.locks, [cell]: next } }));
      toast.success(next ? "Not kilitlendi, öğrenci değiştiremez." : "Kilit kaldırıldı, not düzenlenebilir.");
    } catch (e) {
      toast.error(friendlyError(e, "Kilit değiştirilemedi, tekrar dene."));
    }
  }

  async function handleDecision(decision: "approve" | "reject") {
    if (!card.courseId) return;
    setBusy(true);
    try {
      const res = await decideCourseRemoval(card.courseId, decision);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setApproveOpen(false);
      if (decision === "approve") {
        onRemoved(card.key);
        toast.success("Ders öğrencinin listesinden kaldırıldı.");
      } else {
        patchCard(card.key, () => ({ removalStatus: "rejected" }));
        toast.success("Talep reddedildi.");
      }
    } catch (e) {
      toast.error(friendlyError(e, "İşlem tamamlanamadı, tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("overflow-hidden rounded-lg border-2 shadow-xs", color.border, color.body)} aria-label={card.name}>
      <header className={cn("px-3 py-2", color.header)}>
        <h2 className="truncate text-center text-sm font-bold tracking-wide uppercase" title={card.name}>
          {card.name}
        </h2>
      </header>

      {card.removalStatus === "pending" && (
        <div className="bg-background/60 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <span>Öğrenci bu dersi almadığını bildirdi.</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => setApproveOpen(true)}>
              Onayla
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleDecision("reject")}>
              Reddet
            </Button>
          </span>
        </div>
      )}
      {card.removalStatus === "rejected" && (
        <p className="bg-background/60 px-3 py-1.5 text-center text-xs">Öğrencinin bu dersi silme talebini reddettin.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-center text-xs">
          <thead>
            <tr>
              <th className="w-12 border-b border-r border-inherit" rowSpan={2} aria-hidden />
              {TERMS.map((term) => (
                <th key={term} colSpan={2} className="border-b border-l border-inherit px-1 py-1.5 text-sm font-medium">
                  {TERM_LABELS[term]}
                </th>
              ))}
            </tr>
            <tr>
              {TERMS.flatMap((term) =>
                EXAM_NOS.map((examNo) => (
                  <th key={`${term}-${examNo}`} className="border-b border-l border-inherit px-1 py-1 text-[10px] font-semibold">
                    {EXAM_LABELS[examNo]}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="border-r border-inherit px-1 py-2 text-[11px] font-medium">
                Not
              </th>
              {TERMS.flatMap((term) =>
                EXAM_NOS.map((examNo) => {
                  const cell = gradeCellKey(term, examNo);
                  const saved = card.grades[cell] ?? null;
                  const locked = card.locks[cell] === true;
                  const label = `${card.name} ${TERM_LABELS[term]} ${EXAM_LABELS[examNo]}`;
                  return (
                    <td key={cell} className={cn("border-l border-inherit p-0", locked && "bg-black/5 dark:bg-white/5")}>
                      <div className="flex items-center">
                        <GradeCell label={label} saved={saved} onSave={(value) => handleSaveGrade(term, examNo, value)} />
                        {saved !== null && (
                          <button
                            type="button"
                            onClick={() => handleToggleLock(term, examNo)}
                            className={cn(
                              "mr-0.5 flex size-6 shrink-0 items-center justify-center rounded transition-colors",
                              locked ? "text-foreground hover:bg-black/10 dark:hover:bg-white/10" : "text-muted-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10",
                            )}
                            aria-pressed={locked}
                            aria-label={locked ? `${label} notunun kilidini aç` : `${label} notunu kilitle`}
                            title={locked ? "Kilitli: öğrenci değiştiremez (kilidi aç)" : "Kilitle: öğrenci değiştiremesin"}
                          >
                            {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                }),
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dersi kaldır</DialogTitle>
            <DialogDescription>
              “{card.name}” dersi öğrencinin yazılı listesinden kaldırılır. Girilmiş notlar silinmez, yalnızca ders gizlenir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="button" onClick={() => handleDecision("approve")} disabled={busy}>
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// One editable grade box: saved on blur / Enter, reverted if the save fails (the same box the student has).
function GradeCell({ label, saved, onSave }: { label: string; saved: number | null; onSave: (value: number | null) => Promise<boolean> }) {
  const [text, setText] = useState(formatGrade(saved));
  const [invalid, setInvalid] = useState(false);
  // What the server has: the box reverts to it if a save fails.
  const lastSaved = useRef(saved);

  async function commit() {
    const parsed = parseGrade(text);
    if (!parsed.ok) {
      setInvalid(true);
      toast.error(parsed.error);
      return;
    }
    setInvalid(false);
    if (parsed.value === lastSaved.current) {
      setText(formatGrade(parsed.value));
      return;
    }
    const ok = await onSave(parsed.value);
    if (ok) {
      lastSaved.current = parsed.value;
      setText(formatGrade(parsed.value));
    } else {
      setText(formatGrade(lastSaved.current));
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      maxLength={6}
      placeholder="–"
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value.replace(/[^0-9.,]/g, ""));
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn(
        "placeholder:text-muted-foreground/60 h-10 min-w-0 flex-1 bg-transparent px-1 text-center text-sm tabular-nums outline-none focus:bg-background/70",
        invalid && "bg-destructive/10 text-destructive",
      )}
    />
  );
}
