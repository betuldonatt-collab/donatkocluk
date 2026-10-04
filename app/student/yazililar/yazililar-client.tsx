"use client";

import { useRef, useState } from "react";
import { Check, Palette, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { friendlyError } from "@/lib/friendly-error";
import {
  checkCourseName,
  EXAM_LABELS,
  EXAM_NOS,
  formatGrade,
  MAX_COURSE_NAME_LENGTH,
  parseGrade,
  SCHOOL_COLORS,
  schoolColor,
  TERM_LABELS,
  TERMS,
  type ExamNo,
  type RemovalStatus,
  type SchoolCourseDef,
  type Term,
} from "@/lib/school-exams";
import { cn } from "@/lib/utils";
import {
  addCustomSchoolCourse,
  cancelSchoolCourseRemoval,
  deleteCustomSchoolCourse,
  renameCustomSchoolCourse,
  requestSchoolCourseRemoval,
  saveSchoolGrade,
  setSchoolCourseColor,
} from "./actions";

export type StoredCourse = {
  id: string;
  key: string;
  isCustom: boolean;
  name: string;
  color: string | null;
  removalStatus: RemovalStatus;
  removed: boolean;
};
export type StoredGrade = { courseId: string; term: Term; examNo: ExamNo; grade: number };

type Card = {
  key: string;
  name: string;
  isCustom: boolean;
  courseId: string | null;
  color: string | null;
  removalStatus: RemovalStatus;
  // "term-examNo" -> the saved grade
  grades: Record<string, number | null>;
  // Position among the defaults, for the colour a card gets until the student picks one.
  defaultIndex: number;
};

const cellKey = (term: Term, examNo: ExamNo) => `${term}-${examNo}`;

function buildCards(defaults: SchoolCourseDef[], courses: StoredCourse[], grades: StoredGrade[]): Card[] {
  const byKey = new Map(courses.map((c) => [c.key, c]));
  const gradesOf = (courseId: string | null) => {
    const out: Record<string, number | null> = {};
    if (courseId) for (const g of grades) if (g.courseId === courseId) out[cellKey(g.term, g.examNo)] = g.grade;
    return out;
  };
  const cards: Card[] = [];
  defaults.forEach((def, i) => {
    const row = byKey.get(def.key);
    if (row?.removed) return; // the coach approved dropping it
    cards.push({
      key: def.key,
      name: def.name,
      isCustom: false,
      courseId: row?.id ?? null,
      color: row?.color ?? null,
      removalStatus: row?.removalStatus ?? "none",
      grades: gradesOf(row?.id ?? null),
      defaultIndex: i,
    });
  });
  for (const row of courses) {
    if (!row.isCustom || row.removed) continue;
    cards.push({ key: row.key, name: row.name, isCustom: true, courseId: row.id, color: row.color, removalStatus: "none", grades: gradesOf(row.id), defaultIndex: cards.length });
  }
  return cards;
}

export function YazililarClient({
  defaults,
  courses,
  grades,
  readOnly,
}: {
  defaults: SchoolCourseDef[];
  courses: StoredCourse[];
  grades: StoredGrade[];
  readOnly: boolean;
}) {
  const [cards, setCards] = useState(() => buildCards(defaults, courses, grades));
  const [addOpen, setAddOpen] = useState(false);
  const patchCard = (key: string, patch: Partial<Card> | ((c: Card) => Partial<Card>)) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {cards.map((card) => (
          <CourseCard key={card.key} card={card} readOnly={readOnly} patchCard={patchCard} onDeleted={(key) => setCards((prev) => prev.filter((c) => c.key !== key))} />
        ))}
      </div>

      {!readOnly && (
        <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Yeni Ders Ekle
        </Button>
      )}

      <AddCourseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(row) =>
          setCards((prev) => [
            ...prev,
            { key: row.course_key, name: row.name, isCustom: true, courseId: row.id, color: row.color, removalStatus: "none", grades: {}, defaultIndex: prev.length },
          ])
        }
      />
    </div>
  );
}

function CourseCard({
  card,
  readOnly,
  patchCard,
  onDeleted,
}: {
  card: Card;
  readOnly: boolean;
  patchCard: (key: string, patch: Partial<Card> | ((c: Card) => Partial<Card>)) => void;
  onDeleted: (key: string) => void;
}) {
  const color = schoolColor(card.color, card.defaultIndex);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(card.name);

  async function handleSaveGrade(term: Term, examNo: ExamNo, value: number | null): Promise<boolean> {
    try {
      const res = await saveSchoolGrade({ courseKey: card.key, term, examNo, value });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      patchCard(card.key, (c) => ({ courseId: res.data.courseId, grades: { ...c.grades, [cellKey(term, examNo)]: value } }));
      return true;
    } catch (e) {
      toast.error(friendlyError(e, "Not kaydedilemedi, tekrar dene."));
      return false;
    }
  }

  async function handleColor(key: string) {
    const previous = card.color;
    patchCard(card.key, { color: key });
    try {
      const res = await setSchoolCourseColor({ courseKey: card.key, color: key });
      if (!res.ok) throw new Error(res.error);
      patchCard(card.key, { courseId: res.data.courseId });
    } catch (e) {
      patchCard(card.key, { color: previous });
      toast.error(friendlyError(e, "Renk kaydedilemedi, tekrar dene."));
    }
  }

  async function handleRename() {
    const checked = checkCourseName(nameDraft);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    if (checked.name === card.name || !card.courseId) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      const res = await renameCustomSchoolCourse({ courseId: card.courseId, name: checked.name });
      if (!res.ok) throw new Error(res.error);
      patchCard(card.key, { name: checked.name });
      setRenaming(false);
    } catch (e) {
      toast.error(friendlyError(e, "Ders adı kaydedilemedi, tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      if (card.isCustom) {
        if (!card.courseId) {
          onDeleted(card.key);
        } else {
          const res = await deleteCustomSchoolCourse(card.courseId);
          if (!res.ok) throw new Error(res.error);
          onDeleted(card.key);
        }
        toast.success("Ders silindi.");
      } else {
        const res = await requestSchoolCourseRemoval(card.key);
        if (!res.ok) throw new Error(res.error);
        patchCard(card.key, { removalStatus: "pending" });
        toast.success("Koçuna bildirildi. Onaylarsa ders kaldırılacak.");
      }
      setRemoveOpen(false);
    } catch (e) {
      toast.error(friendlyError(e, "İşlem tamamlanamadı, tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    setBusy(true);
    try {
      const res = await cancelSchoolCourseRemoval(card.key);
      if (!res.ok) throw new Error(res.error);
      patchCard(card.key, { removalStatus: "none" });
    } catch (e) {
      toast.error(friendlyError(e, "Talep geri çekilemedi, tekrar dene."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("overflow-hidden rounded-lg border-2 shadow-xs", color.border, color.body)} aria-label={card.name}>
      <header className={cn("flex items-center justify-between gap-2 px-3 py-2", color.header)}>
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              handleRename();
            }}
          >
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={MAX_COURSE_NAME_LENGTH}
              autoFocus
              aria-label="Ders adı"
              className="bg-background h-8 text-sm"
            />
            <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy} aria-label="Adı kaydet">
              <Check className="size-4" />
            </Button>
          </form>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-center text-sm font-bold tracking-wide uppercase" title={card.name}>
            {card.name}
          </h2>
        )}

        {!readOnly && !renaming && (
          <div className="flex shrink-0 items-center gap-0.5">
            {card.isCustom && (
              <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => { setNameDraft(card.name); setRenaming(true); }} aria-label="Dersi yeniden adlandır" title="Yeniden adlandır">
                <Pencil className="size-3.5" />
              </Button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Kart rengini değiştir" title="Rengi değiştir">
                  <Palette className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <ColorSwatches value={card.color} fallbackIndex={card.defaultIndex} onPick={handleColor} />
              </PopoverContent>
            </Popover>
            {card.removalStatus === "pending" ? (
              <Button type="button" size="icon" variant="ghost" className="size-7" onClick={handleWithdraw} disabled={busy} aria-label="Silme talebini geri çek" title="Talebi geri çek">
                <Undo2 className="size-3.5" />
              </Button>
            ) : (
              <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setRemoveOpen(true)} aria-label={card.isCustom ? "Dersi sil" : "Bu dersi almıyorum"} title={card.isCustom ? "Dersi sil" : "Bu dersi almıyorum"}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </header>

      {card.removalStatus === "pending" && (
        <p className="bg-background/60 px-3 py-1.5 text-center text-xs">Silme talebin koçunda, onay bekliyor.</p>
      )}
      {card.removalStatus === "rejected" && (
        <p className="bg-background/60 px-3 py-1.5 text-center text-xs">Koçun bu dersi silme talebini onaylamadı.</p>
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
                EXAM_NOS.map((examNo) => (
                  <td key={`${term}-${examNo}`} className="border-l border-inherit p-0">
                    <GradeCell
                      label={`${card.name} ${TERM_LABELS[term]} ${EXAM_LABELS[examNo]}`}
                      saved={card.grades[cellKey(term, examNo)] ?? null}
                      disabled={readOnly || card.removalStatus === "pending"}
                      onSave={(value) => handleSaveGrade(term, examNo, value)}
                    />
                  </td>
                )),
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{card.isCustom ? "Dersi sil" : "Bu dersi almıyor musun?"}</DialogTitle>
            <DialogDescription>
              {card.isCustom
                ? `“${card.name}” dersi ve girdiğin tüm notlar silinecek.`
                : `“${card.name}” dersini almadığını koçuna bildireceğiz. Koçun onaylarsa ders kartı kaldırılır; onaylayana kadar kartın yerinde durur.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="button" variant={card.isCustom ? "destructive" : "default"} onClick={handleRemove} disabled={busy}>
              {card.isCustom ? "Sil" : "Koçuma Bildir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GradeCell({
  label,
  saved,
  disabled,
  onSave,
}: {
  label: string;
  saved: number | null;
  disabled: boolean;
  onSave: (value: number | null) => Promise<boolean>;
}) {
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
      disabled={disabled}
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
        "placeholder:text-muted-foreground/60 h-10 w-full bg-transparent px-1 text-center text-sm tabular-nums outline-none focus:bg-background/70 disabled:opacity-60",
        invalid && "bg-destructive/10 text-destructive",
      )}
    />
  );
}

function ColorSwatches({ value, fallbackIndex, onPick }: { value: string | null; fallbackIndex: number; onPick: (key: string) => void }) {
  const current = schoolColor(value, fallbackIndex).key;
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Kart rengi">
      {SCHOOL_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={current === c.key}
          aria-label={c.label}
          title={c.label}
          onClick={() => onPick(c.key)}
          className={cn("flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110", c.swatch, current === c.key ? "border-foreground" : "border-transparent")}
        >
          {current === c.key && <Check className="text-foreground size-3.5" />}
        </button>
      ))}
    </div>
  );
}

function AddCourseDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (row: { id: string; course_key: string; name: string; color: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SCHOOL_COLORS[0].key);
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const checked = checkCourseName(name);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    setSaving(true);
    try {
      const res = await addCustomSchoolCourse({ name: checked.name, color });
      if (!res.ok) throw new Error(res.error);
      onAdded(res.data);
      setName("");
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e, "Ders eklenemedi, tekrar dene."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Ders Ekle</DialogTitle>
          <DialogDescription>Listede olmayan bir dersin için kendi kartını oluştur.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_COURSE_NAME_LENGTH} placeholder="Ders adı (örn. Görsel Sanatlar)" aria-label="Ders adı" autoFocus />
          <ColorSwatches value={color} fallbackIndex={0} onPick={setColor} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving || name.trim() === ""}>
              Ekle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
