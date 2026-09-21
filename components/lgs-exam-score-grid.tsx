"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LGS_EXAM_SUBJECTS } from "@/lib/curriculum/subject-groups";
import { computeLgsSubjectResult, formatNet, lgsEmptyFor, summarizeLgsScores } from "@/lib/lgs-exam";
import { isBlankScore } from "@/lib/exam-results-validation";

// The LGS result form, shared by the student's task modal and the coach's
// "Sonuçları Gir": a Doğru / Yanlış row for each of the six subjects. Boş is
// never typed -- it is worked out from the subject's question count -- and the
// Net (3 yanlış 1 doğruyu götürür) and the approximate puan update as you type.

export type LgsScoreInputs = Record<string, { correct: string; wrong: string; empty: string }>;

// Blank inputs for all six subjects, optionally seeded from stored scores.
export function emptyLgsInputs(
  stored?: Record<string, { correct: number | null; wrong: number | null; empty: number | null }> | null,
): LgsScoreInputs {
  return Object.fromEntries(
    LGS_EXAM_SUBJECTS.map((s) => {
      const existing = stored?.[s.key];
      const correct = existing?.correct ?? null;
      const wrong = existing?.wrong ?? null;
      return [
        s.key,
        {
          correct: correct?.toString() ?? "",
          wrong: wrong?.toString() ?? "",
          empty: lgsEmptyFor(s.key, correct, wrong)?.toString() ?? "",
        },
      ];
    }),
  );
}

// Doğru + Yanlış above a subject's question count -- the form refuses to save.
export function lgsOverCapSubject(inputs: LgsScoreInputs) {
  return LGS_EXAM_SUBJECTS.find((s) => {
    const v = inputs[s.key];
    return v ? (Number(v.correct) || 0) + (Number(v.wrong) || 0) > s.questions : false;
  });
}

export function lgsInputsIncomplete(inputs: LgsScoreInputs): boolean {
  return LGS_EXAM_SUBJECTS.some((s) => {
    const v = inputs[s.key];
    return !v || isBlankScore(v.correct) || isBlankScore(v.wrong);
  });
}

// Same digits-only guard the other result forms use (a number input's own min
// doesn't stop a typed "-5").
function sanitizeDigits(v: string) {
  return v.replace(/[^0-9]/g, "");
}

export function LgsExamScoreGrid({
  inputs,
  onChange,
  showMissing,
}: {
  inputs: LgsScoreInputs;
  onChange: (next: LgsScoreInputs) => void;
  // After a refused save: outline the Doğru/Yanlış boxes that are still blank.
  showMissing?: boolean;
}) {
  function update(key: string, field: "correct" | "wrong", raw: string) {
    const value = sanitizeDigits(raw);
    const current = inputs[key] ?? { correct: "", wrong: "", empty: "" };
    const nextRow = { ...current, [field]: value };
    const correct = nextRow.correct.trim() === "" ? null : Number(nextRow.correct);
    const wrong = nextRow.wrong.trim() === "" ? null : Number(nextRow.wrong);
    onChange({ ...inputs, [key]: { ...nextRow, empty: lgsEmptyFor(key, correct, wrong)?.toString() ?? "" } });
  }

  const overCap = lgsOverCapSubject(inputs);
  const summary = summarizeLgsScores(
    Object.fromEntries(
      LGS_EXAM_SUBJECTS.map((s) => {
        const v = inputs[s.key];
        const blank = !v || isBlankScore(v.correct) || isBlankScore(v.wrong);
        return [s.key, { correct: blank ? null : Number(v.correct), wrong: blank ? null : Number(v.wrong), empty: null }];
      }),
    ),
  );

  return (
    <div className="space-y-3">
      {overCap && (
        <p className="text-destructive text-xs">
          {overCap.label} için Doğru + Yanlış en fazla {overCap.questions} olabilir.
        </p>
      )}

      {LGS_EXAM_SUBJECTS.map((s, i) => {
        const v = inputs[s.key] ?? { correct: "", wrong: "", empty: "" };
        const result =
          isBlankScore(v.correct) || isBlankScore(v.wrong)
            ? null
            : computeLgsSubjectResult(s.key, Number(v.correct), Number(v.wrong));
        return (
          <div key={s.key} className="space-y-1.5">
            {s.section !== LGS_EXAM_SUBJECTS[i - 1]?.section && (
              <p className="text-primary pt-1 text-xs font-semibold tracking-wide uppercase">
                {s.section === "SÖZEL" ? "Sözel Bölüm" : "Sayısal Bölüm"}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-foreground text-sm font-medium">
                {s.label}
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">({s.questions} soru)</span>
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                Net: <span className="text-foreground font-semibold">{result ? formatNet(result.net) : "—"}</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ScoreBox
                label="Doğru"
                value={v.correct}
                onChange={(x) => update(s.key, "correct", x)}
                invalid={showMissing && isBlankScore(v.correct)}
              />
              <ScoreBox
                label="Yanlış"
                value={v.wrong}
                onChange={(x) => update(s.key, "wrong", x)}
                invalid={showMissing && isBlankScore(v.wrong)}
              />
              <div className="min-w-0 space-y-1.5">
                <Label className="text-muted-foreground">Boş</Label>
                <p className="border-input bg-muted/30 flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
                  {v.empty === "" ? "—" : v.empty}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      <div className="bg-muted/40 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
        <SummaryStat label="Sözel Net" value={summary ? formatNet(summary.sozelNet) : "—"} />
        <SummaryStat label="Sayısal Net" value={summary ? formatNet(summary.sayisalNet) : "—"} />
        <SummaryStat label="Toplam Net" value={summary ? formatNet(summary.totalNet) : "—"} />
        <SummaryStat
          label="Yaklaşık Puan"
          value={summary ? summary.approxScore.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "—"}
          emphasis
        />
      </div>
      <p className="text-muted-foreground text-[11px]">
        Net = Doğru − Yanlış ÷ 3. Puan, Türkçe / Matematik / Fen (×4) ve diğer dersler (×1) katsayılarıyla hesaplanan yaklaşık bir tahmindir;
        gerçek LGS puanı sınavın genel sonuçlarına göre belirlenir.
      </p>
    </div>
  );
}

function ScoreBox({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={cn("bg-background", invalid && "border-destructive focus-visible:ring-destructive/30")}
      />
    </div>
  );
}

function SummaryStat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={cn("text-foreground tabular-nums", emphasis ? "text-lg font-bold" : "text-base font-semibold")}>{value}</p>
    </div>
  );
}
