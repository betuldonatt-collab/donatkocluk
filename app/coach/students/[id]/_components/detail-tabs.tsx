"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GelisimHaritasiRow } from "@/lib/gelisim-haritasi";
import type { DetailSession, DetailTask, ParagrafProblemEntry } from "../types";
import type { CoachReportCardRow, StudentFixedTask } from "../../../actions";
import { AnalyticsTab } from "./analytics-tab";
import { ChartsTab } from "./charts-tab";
import type { DayStat } from "./daily-stats-summary";
import { GelisimHaritasiTab } from "./gelisim-haritasi-tab";
import { KarnelerTab } from "./karneler-tab";
import { KaynakTakibiTab, type CourseResourceData } from "./kaynak-takibi-tab";
import { ProgramTab } from "./program-tab";
import { SessionsTab } from "./sessions-tab";
import type { TopicPerformanceRow } from "./topic-performance-map";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

export function DetailTabs({
  studentId,
  topicPerformance,
  gelisimHaritasi,
  paragrafEntries,
  generalExams,
  branchExams,
  examMistakes,
  initialWeekDays,
  initialWeekTasks,
  initialFixedTasks,
  courseResourceData,
  today,
  initialWeekStats,
  karneCycles,
  defaultKarneRange,
  allTimeTrackedMinutes,
  initialTab,
  sessions,
}: {
  studentId: string;
  topicPerformance: TopicPerformanceRow[];
  gelisimHaritasi: GelisimHaritasiRow[];
  paragrafEntries: ParagrafProblemEntry[];
  generalExams: DetailTask[];
  branchExams: DetailTask[];
  examMistakes: MistakeRow[];
  initialWeekDays: { date: string; label: string }[];
  initialWeekTasks: DetailTask[];
  initialFixedTasks: StudentFixedTask[];
  courseResourceData: CourseResourceData;
  today: string;
  initialWeekStats: DayStat[];
  karneCycles: CoachReportCardRow[];
  defaultKarneRange: { rangeStart: string; rangeEnd: string } | null;
  allTimeTrackedMinutes: number;
  initialTab: string;
  sessions: DetailSession[];
}) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="analiz">Analiz</TabsTrigger>
        <TabsTrigger value="gelisim-haritasi">Gelişim Haritası</TabsTrigger>
        <TabsTrigger value="grafikler">Grafikler</TabsTrigger>
        <TabsTrigger value="program">Program</TabsTrigger>
        <TabsTrigger value="kaynak-takibi">Kaynak Takibi</TabsTrigger>
        <TabsTrigger value="karneler">Karneler</TabsTrigger>
        <TabsTrigger value="gorusmeler">Görüşmeler</TabsTrigger>
      </TabsList>

      <TabsContent value="analiz" className="pt-4">
        <AnalyticsTab
          studentId={studentId}
          topicPerformance={topicPerformance}
          branchExams={branchExams}
          generalExams={generalExams}
          examMistakes={examMistakes}
          weekDays={initialWeekDays}
          courseResourceData={courseResourceData}
        />
      </TabsContent>

      <TabsContent value="gelisim-haritasi" className="pt-4">
        <GelisimHaritasiTab rows={gelisimHaritasi} />
      </TabsContent>

      <TabsContent value="grafikler" className="pt-4">
        <ChartsTab paragrafEntries={paragrafEntries} generalExams={generalExams} branchExams={branchExams} />
      </TabsContent>

      <TabsContent value="program" className="pt-4">
        <ProgramTab
          studentId={studentId}
          initialWeekDays={initialWeekDays}
          initialTasks={initialWeekTasks}
          initialFixedTasks={initialFixedTasks}
        />
      </TabsContent>

      <TabsContent value="kaynak-takibi" className="pt-4">
        <KaynakTakibiTab studentId={studentId} courseData={courseResourceData} today={today} initialWeekStats={initialWeekStats} />
      </TabsContent>

      <TabsContent value="karneler" className="pt-4">
        <KarnelerTab
          studentId={studentId}
          cycles={karneCycles}
          defaultRange={defaultKarneRange}
          allTimeTrackedMinutes={allTimeTrackedMinutes}
        />
      </TabsContent>

      <TabsContent value="gorusmeler" className="pt-4">
        <SessionsTab studentId={studentId} initialSessions={sessions} />
      </TabsContent>
    </Tabs>
  );
}
