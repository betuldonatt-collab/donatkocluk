"use client";

import { Checkbox } from "@/components/ui/checkbox";
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
import { PAST_QUESTION_YEARS, pastQuestionKey, type PastQuestionMap } from "../_lib/shared";

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

export function PastQuestionsTable({
  course,
  progress,
  onToggle,
}: {
  course: Course;
  progress: PastQuestionMap;
  onToggle: (topicId: string, year: number) => void;
}) {
  const rows = flattenRows(course);

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
                  {year}
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
                  const solved = progress[pastQuestionKey(row.topic.id, year)] ?? false;
                  return (
                    <TableCell key={year} className="border-l text-center">
                      <Checkbox
                        checked={solved}
                        onCheckedChange={() => onToggle(row.topic.id, year)}
                        aria-label={`${course.name} - ${row.topic.name} - ${year}`}
                      />
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
