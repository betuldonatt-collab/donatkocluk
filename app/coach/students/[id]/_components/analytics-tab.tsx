import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatChartRangeLabel, isDateInChartRange, type ChartRange } from "@/lib/chart-range";
import type { ExamType } from "@/lib/exam-type";
import type { DetailTask } from "../types";
import { CoachExamAnalysisSection } from "./coach-exam-analysis-section";
import type { CourseResourceData } from "./kaynak-takibi-tab";
import { TopicPerformanceMap, type TopicPerformanceRow } from "./topic-performance-map";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

// A stable, unique-per-value string for the `key` below -- formatChartRangeLabel
// is meant for humans (two different custom ranges could in principle format
// alike), this is meant for React's identity check.
function rangeKey(range: ChartRange): string {
  return range.type === "last30" ? "last30" : `custom:${range.startDate}:${range.endDate}`;
}

export function AnalyticsTab({
  studentId,
  topicPerformance,
  branchExams,
  generalExams,
  examMistakes,
  weekDays,
  courseResourceData,
  examType = "YKS",
  chartRange,
}: {
  studentId: string;
  // Deliberately NOT filtered by chartRange -- Konu Performans Haritası is
  // an all-time sample-size map (see topic-performance-map.tsx's own
  // fetch, page.tsx), and a 30-day (or shorter) window would make an
  // already-thin per-topic sample size even thinner, or silently drop a
  // whole course/track a coach hasn't tested recently. Same reasoning
  // Kaynak Takibi's lifetime totals are excluded from this filter for.
  topicPerformance: TopicPerformanceRow[];
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  weekDays: { date: string; label: string }[];
  courseResourceData: CourseResourceData;
  examType?: ExamType;
  chartRange: ChartRange;
}) {
  const branchExamsInRange = branchExams.filter((e) => isDateInChartRange(e.task_date, chartRange));
  const generalExamsInRange = generalExams.filter((e) => isDateInChartRange(e.task_date, chartRange));
  const examIdsInRange = new Set([...branchExamsInRange, ...generalExamsInRange].map((e) => e.id));
  const examMistakesInRange = examMistakes.filter((m) => examIdsInRange.has(m.task_id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konu Performans Haritası</CardTitle>
          <p className="text-muted-foreground text-sm">Tüm zamanlar -- bu harita tarih filtresinden etkilenmez.</p>
        </CardHeader>
        <CardContent>
          <TopicPerformanceMap rows={topicPerformance} examType={examType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deneme Konu Analizi</CardTitle>
          <p className="text-muted-foreground text-sm">{formatChartRangeLabel(chartRange)}</p>
        </CardHeader>
        <CardContent>
          {/* Keyed to the range: CoachExamAnalysisSection copies its exam/
              mistake props into its OWN local state on mount (it edits
              and deletes exams interactively), so a later prop change
              alone wouldn't re-filter an already-mounted instance -- a
              range change is exactly the moment a clean remount (fresh
              state from the new, narrower props) is wanted anyway. */}
          <CoachExamAnalysisSection
            key={rangeKey(chartRange)}
            studentId={studentId}
            branchExams={branchExamsInRange}
            generalExams={generalExamsInRange}
            examMistakes={examMistakesInRange}
            weekDays={weekDays}
            courseResourceData={courseResourceData}
            examType={examType}
          />
        </CardContent>
      </Card>
    </div>
  );
}
