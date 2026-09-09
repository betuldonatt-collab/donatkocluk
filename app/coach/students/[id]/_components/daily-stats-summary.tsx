"use client";

import { useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { autoCalcMissingField, countsAreConsistent } from "@/lib/count-fields";
import { cn } from "@/lib/utils";
import { overrideStudentDailyStats } from "../../../actions";

export type DayStat = { date: string; total: number; correct: number; wrong: number; empty: number };

const EMPTY_STAT: Omit<DayStat, "date"> = { total: 0, correct: 0, wrong: 0, empty: 0 };

function sumStats(rows: DayStat[]) {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      correct: acc.correct + r.correct,
      wrong: acc.wrong + r.wrong,
      empty: acc.empty + r.empty,
    }),
    { ...EMPTY_STAT },
  );
}

// Same widget the student sees (Toplam Soru + Doğru/Yanlış/Boş badges,
// Bugün/Bu Hafta toggle), plus the coach's override: a pencil next to
// "Bugün" opens a small form that replaces that one day's row outright
// (overrideStudentDailyStats) -- a deliberate manual correction, not
// another automatic recompute, for whenever the student's organic total
// is wrong or incomplete.
export function DailyStatsSummary({ studentId, today, initialWeekStats }: { studentId: string; today: string; initialWeekStats: DayStat[] }) {
  const [weekStats, setWeekStats] = useState(initialWeekStats);
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ total: "", correct: "", wrong: "", empty: "" });

  const todayStat = weekStats.find((s) => s.date === today) ?? { date: today, ...EMPTY_STAT };
  const weekTotal = sumStats(weekStats);
  const stat = view === "daily" ? todayStat : weekTotal;

  // Blank fields are saved as 0 here (handleSave below), not left
  // unset -- so, unlike the other two count-entry forms, this check
  // always evaluates the real equation rather than skipping on a blank.
  const totalMismatch = !countsAreConsistent({
    total: Number(form.total) || 0,
    correct: Number(form.correct) || 0,
    wrong: Number(form.wrong) || 0,
    empty: Number(form.empty) || 0,
  });

  function openEditor() {
    setForm({
      total: String(todayStat.total),
      correct: String(todayStat.correct),
      wrong: String(todayStat.wrong),
      empty: String(todayStat.empty),
    });
    setEditing(true);
  }

  // If exactly 3 of Toplam/Doğru/Yanlış/Boş are filled, auto-fills the 4th
  // (lib/count-fields.ts) so the coach doesn't have to do the arithmetic.
  function handleFormFieldChange(field: "total" | "correct" | "wrong" | "empty", value: string) {
    const toNumOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const next = { ...form, [field]: value };
    const derived = autoCalcMissingField({
      total: toNumOrNull(next.total),
      correct: toNumOrNull(next.correct),
      wrong: toNumOrNull(next.wrong),
      empty: toNumOrNull(next.empty),
    });
    setForm({
      total: derived.total !== undefined ? String(derived.total) : next.total,
      correct: derived.correct !== undefined ? String(derived.correct) : next.correct,
      wrong: derived.wrong !== undefined ? String(derived.wrong) : next.wrong,
      empty: derived.empty !== undefined ? String(derived.empty) : next.empty,
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await overrideStudentDailyStats(studentId, {
        entryDate: today,
        totalCount: Number(form.total) || 0,
        correctCount: Number(form.correct) || 0,
        wrongCount: Number(form.wrong) || 0,
        emptyCount: Number(form.empty) || 0,
      });
      setWeekStats((prev) => {
        const next = prev.filter((s) => s.date !== today);
        next.push({
          date: today,
          total: updated.total_count,
          correct: updated.correct_count,
          wrong: updated.wrong_count,
          empty: updated.empty_count,
        });
        return next;
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {(["daily", "weekly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "daily" ? "Bugün" : "Bu Hafta"}
            </button>
          ))}
        </div>
        {view === "daily" && (
          <Button type="button" variant="outline" size="sm" onClick={openEditor}>
            <Pencil className="size-3.5" />
            Düzenle
          </Button>
        )}
      </div>

      {editing ? (
        <div className="border-border bg-muted/30 grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="stat-total">Toplam</Label>
            <Input id="stat-total" type="number" min={0} value={form.total} onChange={(e) => handleFormFieldChange("total", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stat-correct">Doğru</Label>
            <Input id="stat-correct" type="number" min={0} value={form.correct} onChange={(e) => handleFormFieldChange("correct", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stat-wrong">Yanlış</Label>
            <Input id="stat-wrong" type="number" min={0} value={form.wrong} onChange={(e) => handleFormFieldChange("wrong", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stat-empty">Boş</Label>
            <Input id="stat-empty" type="number" min={0} value={form.empty} onChange={(e) => handleFormFieldChange("empty", e.target.value)} />
          </div>
          {totalMismatch && (
            <div className="bg-destructive/10 text-destructive col-span-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs sm:col-span-4">
              <AlertTriangle className="size-3.5 shrink-0" />
              Toplam, Doğru + Yanlış + Boş toplamına eşit değil.
            </div>
          )}
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || totalMismatch}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              İptal
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-border bg-muted/30 flex flex-col items-center gap-3 rounded-lg border p-4">
          <Tooltip
            content={
              <div className="space-y-0.5">
                <p>Toplam: {stat.total}</p>
                <p>Doğru: {stat.correct}</p>
                <p>Yanlış: {stat.wrong}</p>
                <p>Boş: {stat.empty}</p>
              </div>
            }
          >
            <div className="cursor-default text-center">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Toplam Soru</p>
              <p className="text-foreground text-3xl font-bold tabular-nums">{stat.total}</p>
            </div>
          </Tooltip>

          <div className="flex flex-wrap justify-center gap-2">
            <StatBadge label="Doğru" value={stat.correct} tone="green" />
            <StatBadge label="Yanlış" value={stat.wrong} tone="red" />
            <StatBadge label="Boş" value={stat.empty} tone="amber" />
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_CLASSES = {
  green: "bg-emerald-500/15 text-emerald-700",
  red: "bg-rose-500/15 text-rose-700",
  amber: "bg-amber-500/15 text-amber-700",
} as const;

function StatBadge({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE_CLASSES }) {
  return (
    <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", TONE_CLASSES[tone])}>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
