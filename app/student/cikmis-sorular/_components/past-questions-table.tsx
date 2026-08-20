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

// Some multi-topic clusters in the source spreadsheets track ONE combined
// question count for the whole cluster rather than one per sub-topic (a
// merged-cell pattern in the original Excel, or simply how these
// sub-topics are conventionally studied/tested as a unit). Showing each
// sub-topic's number separately would either repeat one aggregate as if
// it belonged to a single sub-topic, or fragment a genuinely-combined
// concept — so these listed topic ids get summed and shown as one
// spanning cell instead of one row each. Every other topic renders
// individually, unchanged.
const FREQUENCY_GROUPS: Record<string, string[][]> = {
  "tyt-turkce": [
    ["tyt-turkce-u0-t0", "tyt-turkce-u0-t1", "tyt-turkce-u0-t2"], // Anlam Bilgisi (first 3)
    [
      "tyt-turkce-u2-t0",
      "tyt-turkce-u2-t1",
      "tyt-turkce-u2-t2",
      "tyt-turkce-u2-t3",
      "tyt-turkce-u2-t4",
    ], // Fiiller (5, starting from Fiillerde Kip ve Kişi)
  ],
  "tyt-matematik": [
    [
      "tyt-matematik-u1-t0",
      "tyt-matematik-u1-t1",
      "tyt-matematik-u1-t2",
      "tyt-matematik-u1-t3",
      "tyt-matematik-u1-t4",
      "tyt-matematik-u1-t5",
      "tyt-matematik-u1-t6",
      "tyt-matematik-u1-t7",
    ], // Problemler (Sayı-Kesir .. Rutin Olmayan Problemler)
  ],
  "ayt-matematik-sayisal": [
    ["ayt-matematik-u2-t0", "ayt-matematik-u2-t1", "ayt-matematik-u2-t2", "ayt-matematik-u2-t3"], // Trigonometri
  ],
  "ayt-matematik-ea": [
    ["ayt-matematik-u2-t0", "ayt-matematik-u2-t1", "ayt-matematik-u2-t2", "ayt-matematik-u2-t3"], // Trigonometri
  ],
  "ayt-fizik": [
    ["ayt-fizik-u2-t0", "ayt-fizik-u2-t1", "ayt-fizik-u2-t2", "ayt-fizik-u2-t3"], // Çembersel Hareket
  ],
};

type Row = {
  topic: Topic;
  unitLabel: string;
  unitRowSpan: number | null;
  group: { members: string[]; isFirst: boolean } | null;
};

function flattenRows(course: Course): Row[] {
  const groupByTopicId = new Map<string, { members: string[]; isFirst: boolean }>();
  for (const members of FREQUENCY_GROUPS[course.id] ?? []) {
    members.forEach((id, i) => groupByTopicId.set(id, { members, isFirst: i === 0 }));
  }

  const rows: Row[] = [];
  for (const group of course.units) {
    if (group.unit === "-") {
      for (const topic of group.topics) {
        rows.push({ topic, unitLabel: "-", unitRowSpan: 1, group: groupByTopicId.get(topic.id) ?? null });
      }
    } else {
      group.topics.forEach((topic, i) => {
        rows.push({
          topic,
          unitLabel: group.unit,
          unitRowSpan: i === 0 ? group.topics.length : null,
          group: groupByTopicId.get(topic.id) ?? null,
        });
      });
    }
  }
  return rows;
}

function sumFrequency(topics: Topic[], memberIds: string[], year: number): number | undefined {
  const byId = new Map(topics.map((t) => [t.id, t]));
  let sum = 0;
  let hasAny = false;
  for (const id of memberIds) {
    const v = byId.get(id)?.frequency?.[String(year)];
    if (v !== undefined) {
      sum += v;
      hasAny = true;
    }
  }
  return hasAny ? sum : undefined;
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

function FrequencyCell({ count }: { count: number | undefined }) {
  return (
    <div className="flex h-full items-center justify-center">
      {count === undefined ? (
        <span className="text-muted-foreground/40" title="Bu konu için kayıt yok">
          –
        </span>
      ) : count === 0 ? (
        <span className="text-muted-foreground">0</span>
      ) : (
        <span className="font-medium">{count}</span>
      )}
    </div>
  );
}

// A pure reference table — no student state, nothing to save. Just how
// many questions came from each topic (or topic cluster) in each year,
// straight from the curriculum data, so a student can see which topics
// carry the most exam weight.
export function PastQuestionsTable({ course }: { course: Course }) {
  const rows = flattenRows(course);
  const allTopics = rows.map((r) => r.topic);
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
                  if (row.group && !row.group.isFirst) return null; // covered by the group's spanning cell above
                  const count = row.group
                    ? sumFrequency(allTopics, row.group.members, year)
                    : row.topic.frequency?.[String(year)];
                  return (
                    <TableCell
                      key={year}
                      rowSpan={row.group ? row.group.members.length : 1}
                      className={cn(
                        "border-l p-0 text-center tabular-nums",
                        row.group && "bg-accent/40",
                      )}
                    >
                      <FrequencyCell count={count} />
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
