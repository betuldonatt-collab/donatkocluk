import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DetailTask } from "../types";
import { CoachExamAnalysisSection } from "./coach-exam-analysis-section";
import type { CourseResourceData } from "./kaynak-takibi-tab";
import { TopicPerformanceMap, type TopicPerformanceRow } from "./topic-performance-map";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

export function AnalyticsTab({
  studentId,
  topicPerformance,
  branchExams,
  generalExams,
  examMistakes,
  weekDays,
  courseResourceData,
}: {
  studentId: string;
  topicPerformance: TopicPerformanceRow[];
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  weekDays: { date: string; label: string }[];
  courseResourceData: CourseResourceData;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konu Performans Haritası</CardTitle>
        </CardHeader>
        <CardContent>
          <TopicPerformanceMap rows={topicPerformance} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deneme Konu Analizi</CardTitle>
        </CardHeader>
        <CardContent>
          <CoachExamAnalysisSection
            studentId={studentId}
            branchExams={branchExams}
            generalExams={generalExams}
            examMistakes={examMistakes}
            weekDays={weekDays}
            courseResourceData={courseResourceData}
          />
        </CardContent>
      </Card>
    </div>
  );
}
