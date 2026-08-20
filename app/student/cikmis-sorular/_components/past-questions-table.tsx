import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Course, Topic } from "@/lib/curriculum";

export const PAST_QUESTION_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

type Row = { topic: Topic; unitLabel: string; unitRowSpan: number | null };

function flattenRows(course: Course): Row[] {
  const rows: Row[] = [];
  for (const group of course.units) {
    if (group.unit === "-") {
      for (const topic of group.topics) {
        rows.push({ topic, unitLabel: "-", unitRowSpan: 1 });
      }
    } else {
      group.topics.forEach((topic, i) => {
        rows.push({ topic, unitLabel: group.unit, unitRowSpan: i === 0 ? group.topics.length : null });
      });
    }
  }
  return rows;
}

// Sums each topic's historical per-year question count (captured from the
// source workbooks' year columns during curriculum parsing). Not every
// topic has this data — grammar-level sub-topics like "Sıfatlar" have no
// year columns at all in the source, so this total only reflects topics
// that were tracked, not a guaranteed exam-wide count.
function yearTotals(course: Course, years: number[]) {
  const totals: Record<number, number> = {};
  for (const year of years) totals[year] = 0;
  for (const group of course.units) {
    for (const topic of group.topics) {
      for (const year of years) {
        totals[year] += topic.frequency?.[String(year)] ?? 0;
      }
    }
  }
  return totals;
}

// A pure reference table — no student state, nothing to save. Just how
// many questions came from each topic in each year, straight from the
// curriculum data, so a student can see which topics carry the most
// exam weight.
export function PastQuestionsTable({ course }: { course: Course }) {
  const rows = flattenRows(course);
  const totals = yearTotals(course, PAST_QUESTION_YEARS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{course.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 align-bottom">Ünite</TableHead>
              <TableHead className="align-bottom">Konu</TableHead>
              {PAST_QUESTION_YEARS.map((year) => (
                <TableHead key={year} className="border-l text-center">
                  <div>{year}</div>
                  <div className="text-muted-foreground text-[10px] font-normal tabular-nums">
                    {totals[year]} soru
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.topic.id}>
                {row.unitRowSpan !== null && (
                  <TableCell
                    rowSpan={row.unitRowSpan}
                    className={cn("border-r p-0 text-center align-middle", row.unitRowSpan === 1 && "text-muted-foreground")}
                  >
                    {row.unitLabel === "-" ? (
                      "-"
                    ) : (
                      <div className="flex h-full items-center justify-center py-2">
                        <span className="[writing-mode:vertical-rl] rotate-180 font-medium">
                          {row.unitLabel}
                        </span>
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell className="font-medium whitespace-normal">{row.topic.name}</TableCell>
                {PAST_QUESTION_YEARS.map((year) => {
                  const count = row.topic.frequency?.[String(year)];
                  return (
                    <TableCell
                      key={year}
                      className="border-l text-center tabular-nums"
                    >
                      {count === undefined ? (
                        <span className="text-muted-foreground/40" title="Bu konu için kayıt yok">
                          –
                        </span>
                      ) : count === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span className="font-medium">{count}</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
