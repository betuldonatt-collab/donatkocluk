"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMaarif9 } from "@/components/maarif9-context";
import { LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";
import type { DetailSession, DetailTask, LgsDailyRoutine, ParagrafProblemEntry } from "../types";
import type { CoachReportCardRow, StudentFixedTask } from "../../../actions";
import { AnalyticsTab } from "./analytics-tab";
import { ChartRangePicker } from "./charts/chart-range-picker";
import { ChartsTab } from "./charts-tab";
import type { DayStat } from "./daily-stats-summary";
import { GelisimHaritasiTab } from "./gelisim-haritasi-tab";
import { KarnelerTab } from "./karneler-tab";
import { KaynakTakibiTab, type CourseResourceData } from "./kaynak-takibi-tab";
import { ProgramTab } from "./program-tab";
import { SessionsTab } from "./sessions-tab";
import type { TopicPerformanceRow } from "./topic-performance-map";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

// Tabs whose data respects the shared date filter below -- Program,
// Kaynak Takibi, Karneler and Görüşmeler each show their own kind of
// point-in-time/lifetime state (current roster, cumulative resource
// totals, report-card cycles, session history) that a "last 30 days"
// window doesn't meaningfully apply to, so the picker only shows -- and
// only ever affects data -- while one of these three is active.
const RANGE_FILTERED_TABS = new Set(["analiz", "gelisim-haritasi", "grafikler"]);

const MAARIF9_HIDDEN_TABS = new Set(["analiz", "gelisim-haritasi", "grafikler", "kaynak-takibi", "karneler"]);
const NO_HIDDEN_TABS = new Set<string>();

export function DetailTabs({
  studentId,
  topicPerformance,
  curriculumCourseIds,
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
  examType = "YKS",
  lgsRoutines = [],
}: {
  studentId: string;
  topicPerformance: TopicPerformanceRow[];
  // Every curriculum course for this student's cohort -- Gelişim
  // Haritası re-aggregates itself client-side against the live date
  // filter (see GelisimHaritasiTab), so it needs this same course list
  // the server-side computation used to take.
  curriculumCourseIds: string[];
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
  // Which cohort's curriculum / net rule the analytic tabs use.
  examType?: "YKS" | "LGS";
  // LGS students' Paragraf / Kitap Okuma log (lgs_daily_routines).
  lgsRoutines?: LgsDailyRoutine[];
}) {
  // 9th graders (is_maarif9): the TYT/AYT-specific analytics/tracking tabs are
  // hidden; Program and Görüşmeler remain.
  const isMaarif9 = useIsMaarif9();
  const hiddenTabs = isMaarif9 ? MAARIF9_HIDDEN_TABS : NO_HIDDEN_TABS;
  const [activeTab, setActiveTab] = useState(hiddenTabs.has(initialTab) ? "program" : initialTab);
  // One shared filter for Analiz / Gelişim Haritası / Grafikler -- lifted
  // above the tabs (not owned by any one of them) specifically so it
  // survives switching between them, defaulting to Son 30 Gün per the
  // coach's request. branchExams/generalExams/paragrafEntries/lgsRoutines/
  // examMistakes are all this student's full, unfiltered history already
  // (fetched once in page.tsx), so every affected tab filters them
  // client-side against this same value -- no extra fetch needed.
  const [chartRange, setChartRange] = useState<ChartRange>(LAST_30_DAYS_RANGE);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          {!hiddenTabs.has("analiz") && <TabsTrigger value="analiz">Analiz</TabsTrigger>}
          {!hiddenTabs.has("gelisim-haritasi") && <TabsTrigger value="gelisim-haritasi">Gelişim Haritası</TabsTrigger>}
          {!hiddenTabs.has("grafikler") && <TabsTrigger value="grafikler">Grafikler</TabsTrigger>}
          <TabsTrigger value="program">Program</TabsTrigger>
          {!hiddenTabs.has("kaynak-takibi") && <TabsTrigger value="kaynak-takibi">Kaynak Takibi</TabsTrigger>}
          {!hiddenTabs.has("karneler") && <TabsTrigger value="karneler">Karneler</TabsTrigger>}
          <TabsTrigger value="gorusmeler">Görüşmeler</TabsTrigger>
        </TabsList>
        {RANGE_FILTERED_TABS.has(activeTab) && <ChartRangePicker value={chartRange} onChange={setChartRange} />}
      </div>

      <TabsContent value="analiz" className="pt-4">
        <AnalyticsTab
          studentId={studentId}
          topicPerformance={topicPerformance}
          branchExams={branchExams}
          generalExams={generalExams}
          examMistakes={examMistakes}
          weekDays={initialWeekDays}
          courseResourceData={courseResourceData}
          examType={examType}
          chartRange={chartRange}
        />
      </TabsContent>

      <TabsContent value="gelisim-haritasi" className="pt-4">
        <GelisimHaritasiTab
          branchExams={branchExams}
          generalExams={generalExams}
          examMistakes={examMistakes}
          curriculumCourseIds={curriculumCourseIds}
          chartRange={chartRange}
          examType={examType}
        />
      </TabsContent>

      <TabsContent value="grafikler" className="pt-4">
        <ChartsTab
          paragrafEntries={paragrafEntries}
          generalExams={generalExams}
          branchExams={branchExams}
          examType={examType}
          lgsRoutines={lgsRoutines}
          chartRange={chartRange}
        />
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
        <KaynakTakibiTab
          studentId={studentId}
          courseData={courseResourceData}
          today={today}
          initialWeekStats={initialWeekStats}
          examType={examType}
        />
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
