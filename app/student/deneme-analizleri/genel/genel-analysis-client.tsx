"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TRACK_LABELS, type Track } from "@/lib/curriculum";
import type { ExamType } from "@/lib/exam-type";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  LGS_SUBJECT_GROUPS,
  TYT_SUBJECT_GROUPS,
  coursesForAytGroup,
  coursesForGroup,
  coursesForLgsGroup,
  inferAytTrackFromScores,
  type SubjectGroupKey,
} from "@/lib/curriculum/subject-groups";
import { computeLgsNet, computeNet } from "@/lib/scoring";
import { LineChart } from "../../_components/charts/line-chart";
import { getMoreGenelExams, getTaskTopicMistakes } from "../../actions";
import { EXAMS_PAGE_SIZE } from "../../constants";
import { TaskModal } from "../../_components/daily-tasks/task-modal";
import type { StudentTask } from "../../_components/daily-tasks/types";
import { ExamTopicTable } from "../_components/exam-topic-table";

type MistakeRow = { task_id: string; course_id: string; topic_id: string };

// General-exam tasks have no course_id -- the TYT/AYT/LGS track lives only in
// the title text, same convention the coach side uses to build/parse it.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" {
  if (/^LGS\b/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

function netChartFor(exams: StudentTask[], netFn: (c: number, w: number) => number = computeNet) {
  // Overall net = sum of correct/wrong across all subjects, netted once
  // on the totals (not summed per-subject net) so rounding never compounds.
  return exams
    .filter((e) => e.subject_scores)
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => {
      const totals = Object.values(e.subject_scores!).reduce(
        (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0) }),
        { correct: 0, wrong: 0 },
      );
      return { date: e.task_date, value: netFn(totals.correct, totals.wrong) };
    });
}

export function GenelAnalysisClient({
  initialExams,
  initialMistakes,
  initialHasMore,
  examType,
}: {
  initialExams: StudentTask[];
  initialMistakes: MistakeRow[];
  initialHasMore: boolean;
  examType: ExamType;
}) {
  const [exams, setExams] = useState(initialExams);
  const [mistakes, setMistakes] = useState(initialMistakes);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [groupKey, setGroupKey] = useState<SubjectGroupKey>("turkce");
  const [aytTrack, setAytTrack] = useState<Track>("sayisal");
  const [lgsGroupKey, setLgsGroupKey] = useState<string>(LGS_SUBJECT_GROUPS[0].key);
  const [aytGroupKey, setAytGroupKey] = useState(AYT_SUBJECT_GROUPS_BY_TRACK.sayisal[0].key as string);

  const [activeTask, setActiveTask] = useState<StudentTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOpenKey, setModalOpenKey] = useState(0);

  function handleAytTrackChange(next: Track) {
    setAytTrack(next);
    setAytGroupKey(AYT_SUBJECT_GROUPS_BY_TRACK[next][0].key);
  }

  function openExam(task: StudentTask) {
    setActiveTask(task);
    setModalOpenKey((k) => k + 1);
    setModalOpen(true);
  }

  async function handleSaved(updated: StudentTask) {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    const rows = await getTaskTopicMistakes(updated.id);
    setMistakes((prev) => [
      ...prev.filter((m) => m.task_id !== updated.id),
      ...rows.map((r) => ({ task_id: updated.id, course_id: r.course_id, topic_id: r.topic_id })),
    ]);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await getMoreGenelExams(exams.length);
      setExams((prev) => [...prev, ...(more.exams as StudentTask[])]);
      setMistakes((prev) => [...prev, ...more.mistakes]);
      setHasMore(more.exams.length === EXAMS_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  const mistakesByExam = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const m of mistakes) {
      if (!map[m.task_id]) map[m.task_id] = new Set();
      map[m.task_id].add(m.topic_id);
    }
    return map;
  }, [mistakes]);

  const tytExams = exams.filter((e) => parseGeneralExamTrack(e.title) === "tyt");
  const aytExams = exams.filter((e) => parseGeneralExamTrack(e.title) === "ayt");
  const aytTrackExams = aytExams.filter((e) => inferAytTrackFromScores(e.subject_scores) === aytTrack);

  const tytNetChartData = netChartFor(tytExams);
  const aytNetChartData = netChartFor(aytTrackExams);

  const orderedTytExams = tytExams.slice().sort((a, b) => b.task_date.localeCompare(a.task_date));
  const orderedAytExams = aytTrackExams.slice().sort((a, b) => b.task_date.localeCompare(a.task_date));

  const tytCoursesInGroup = coursesForGroup(groupKey);
  const aytCoursesInGroup = coursesForAytGroup(aytTrack, aytGroupKey);

  // LGS: one cohort-wide list (no TYT/AYT split), 3 wrong : 1 right net,
  // and the two real sessions (Sözel / Sayısal) as the group pills.
  const lgsExams = exams
    .filter((e) => parseGeneralExamTrack(e.title) === "lgs")
    .sort((a, b) => b.task_date.localeCompare(a.task_date));
  const lgsNetChartData = netChartFor(lgsExams, computeLgsNet);
  const lgsCoursesInGroup = coursesForLgsGroup(lgsGroupKey);

  const modalAndMore = (
    <>
      {hasMore && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
        </Button>
      )}

      <TaskModal
        task={activeTask}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={handleSaved}
        initialStep="analysis"
        openKey={modalOpenKey}
      />
    </>
  );

  if (examType === "LGS") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Genel Net Gelişimi</CardTitle>
            <CardDescription>Tüm derslerin toplamı üzerinden LGS genel deneme net değişimi (3 yanlış 1 doğruyu götürür)</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart data={lgsNetChartData} />
          </CardContent>
        </Card>

        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {LGS_SUBJECT_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setLgsGroupKey(g.key)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                lgsGroupKey === g.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {lgsCoursesInGroup.map((course) => (
            <ExamTopicTable
              key={course.id}
              course={course}
              exams={lgsExams}
              mistakesByExam={mistakesByExam}
              onOpenExam={openExam}
            />
          ))}
        </div>

        {modalAndMore}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Genel Net Gelişimi</CardTitle>
              <CardDescription>Tüm derslerin toplamı üzerinden genel deneme net değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart data={tytNetChartData} />
            </CardContent>
          </Card>

          <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
            {TYT_SUBJECT_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroupKey(g.key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  groupKey === g.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {tytCoursesInGroup.map((course) => (
              <ExamTopicTable
                key={course.id}
                course={course}
                exams={orderedTytExams}
                mistakesByExam={mistakesByExam}
                onOpenExam={openExam}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ayt" className="space-y-6">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleAytTrackChange(t)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  aytTrack === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Genel Net Gelişimi</CardTitle>
              <CardDescription>Tüm derslerin toplamı üzerinden genel deneme net değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart data={aytNetChartData} />
            </CardContent>
          </Card>

          <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
            {AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack].map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setAytGroupKey(g.key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  aytGroupKey === g.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {aytCoursesInGroup.map((course) => (
              <ExamTopicTable
                key={course.id}
                course={course}
                exams={orderedAytExams}
                mistakesByExam={mistakesByExam}
                onOpenExam={openExam}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {modalAndMore}
    </div>
  );
}
