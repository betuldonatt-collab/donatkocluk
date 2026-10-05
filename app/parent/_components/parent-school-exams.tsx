import { NotebookPen } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { SchoolExamsData } from "@/lib/school-exams-data";
import {
  buildSchoolCards,
  COHORT_LABELS,
  EXAM_LABELS,
  EXAM_NOS,
  formatGrade,
  gradeCellKey,
  schoolColor,
  TERM_LABELS,
  TERMS,
  type SchoolCard,
} from "@/lib/school-exams";
import { cn } from "@/lib/utils";

// The parent's Yazılılar: the student's school-exam grades, per course, per term, per yazılı, in the card
// colours the student picked. STRICTLY read-only -- plain text only: no inputs, no lock controls, no course-drop
// decisions (a parent's database access is select-only as well, migration 0121). A course the student asked to
// drop stays on the list until the coach approves it, exactly as before.
export function ParentSchoolExams({ data }: { data: SchoolExamsData }) {
  if (!data.ready) {
    return <p className="text-muted-foreground text-sm">Yazılı notları şu anda gösterilemiyor.</p>;
  }

  const cards = buildSchoolCards(data.defaults, data.courses, data.grades);
  const entered = cards.reduce((sum, c) => sum + Object.keys(c.grades).length, 0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{COHORT_LABELS[data.cohort]} yazılı notları. Bu sayfa yalnızca görüntüleme içindir.</p>

      {entered === 0 && (
        <EmptyState icon={NotebookPen} title="Henüz not girilmemiş" description="Öğrenci ya da koçu yazılı notlarını girdiğinde burada görünecek." />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {cards.map((card) => (
          <CourseCard key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}

function CourseCard({ card }: { card: SchoolCard }) {
  const color = schoolColor(card.color, card.index);
  return (
    <section className={cn("overflow-hidden rounded-lg border-2 shadow-xs", color.border, color.body)} aria-label={card.name}>
      <header className={cn("px-3 py-2", color.header)}>
        <h2 className="truncate text-center text-sm font-bold tracking-wide uppercase" title={card.name}>
          {card.name}
        </h2>
      </header>

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
                  const grade = card.grades[gradeCellKey(term, examNo)];
                  return (
                    <td
                      key={`${term}-${examNo}`}
                      className={cn("border-l border-inherit px-1 py-2 text-sm tabular-nums", grade === undefined ? "text-muted-foreground" : "text-foreground font-semibold")}
                      aria-label={`${card.name} ${TERM_LABELS[term]} ${EXAM_LABELS[examNo]}`}
                    >
                      {grade === undefined ? "—" : formatGrade(grade)}
                    </td>
                  );
                }),
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
