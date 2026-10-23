import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

type PendingExam = {
  id: string;
  title: string;
  task_date: string;
  total_count?: number | null;
  correct_count?: number | null;
  wrong_count?: number | null;
  empty_count?: number | null;
};

function formatDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const nz = (n: number | null | undefined) => (n == null ? "—" : n);

// The yellow warning box that holds the exams that were SOLVED but whose topic analysis is not finished yet (lib/exam-solved.ts). They are
// kept out of the regular exam list/table and sit apart, on its right, so a missing analysis cannot be mistaken for a normal exam column.
// Each opens the same analysis step the old "Analiz Bekliyor" pill did.
export function PendingAnalysisBox<T extends PendingExam>({
  exams,
  onOpen,
  className,
}: {
  exams: T[];
  onOpen: (exam: T) => void;
  className?: string;
}) {
  if (exams.length === 0) return null;
  return (
    <aside
      data-slot="pending-analysis-box"
      aria-label="Analizi bekleyen denemeler"
      className={cn("space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200", className)}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Analizi bekleyen denemeler</p>
          <p className="text-xs opacity-80">Bu denemelerin sonuçları girildi ama konu analizi tamamlanmadı.</p>
        </div>
      </div>
      <ul className="space-y-2">
        {exams.map((exam) => (
          <li key={exam.id} className="rounded-md border border-amber-500/30 bg-background/70 p-2">
            <p className="truncate text-xs font-semibold text-foreground" title={exam.title}>
              {exam.title}
            </p>
            <p className="text-muted-foreground text-[11px]">{formatDay(exam.task_date)}</p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              T:{nz(exam.total_count)} D:{nz(exam.correct_count)} Y:{nz(exam.wrong_count)} B:{nz(exam.empty_count)}
            </p>
            <button
              type="button"
              onClick={() => onOpen(exam)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-500/30 dark:text-amber-200"
            >
              <span aria-hidden className="font-bold">!</span>
              Analizi Yap
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
