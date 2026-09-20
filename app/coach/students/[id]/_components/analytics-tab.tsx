import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExamType } from "@/lib/exam-type";
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
  examType = "YKS",
}: {
  studentId: string;
  topicPerformance: TopicPerformanceRow[];
  branchExams: DetailTask[];
  generalExams: DetailTask[];
  examMistakes: MistakeRow[];
  weekDays: { date: string; label: string }[];
  courseResourceData: CourseResourceData;
  examType?: ExamType;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konu Performans Haritası</CardTitle>
        </CardHeader>
        <CardContent>
          <TopicPerformanceMap rows={topicPerformance} examType={examType} />
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
            examType={examType}
          />
        </CardContent>
      </Card>
    </div>
  );
}
