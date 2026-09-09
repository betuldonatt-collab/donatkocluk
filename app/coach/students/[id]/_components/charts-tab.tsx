"use client";

import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isDateInChartRange, LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";
import { cn } from "@/lib/utils";
import { AYT_COURSES_BY_TRACK, TRACK_LABELS, TYT_COURSES, findCourseById, type Track } from "@/lib/curriculum";
import { AYT_SUBJECT_GROUPS_BY_TRACK, TYT_SUBJECT_GROUPS, inferAytTrackFromScores } from "@/lib/curriculum/subject-groups";
import { computeNet } from "@/lib/scoring";
import { ChartRangePicker } from "./charts/chart-range-picker";
import { DualMetricChart } from "./charts/dual-metric-chart";
import { StackedBarChart, type StackedSeries } from "./charts/stacked-bar-chart";
import type { DetailTask, ParagrafProblemEntry } from "../types";

// General-exam tasks have no course_id -- the TYT/AYT track lives only in
// the title text, same convention buildGeneralExamTitle/parseGeneralExamTitle
// use coach-side when creating the task.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" {
  return title.toUpperCase().startsWith("AYT") ? "ayt" : "tyt";
}

type ExamMode = "genel" | "brans";
type MainTrack = "tyt" | "ayt";

const GENEL_COLORS = ["var(--primary)", "#f59e0b", "#10b981", "#8b5cf6"];

function seriesFor(groups: { key: string; label: string }[]): StackedSeries[] {
  return groups.map((g, i) => ({ key: g.key, label: g.label, color: GENEL_COLORS[i % GENEL_COLORS.length] }));
}

function selectClassName() {
  return "border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

function TrackToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="bg-secondary inline-flex rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ChartsTab({
  paragrafEntries,
  generalExams,
  branchExams,
}: {
  paragrafEntries: ParagrafProblemEntry[];
  generalExams: DetailTask[];
  branchExams: DetailTask[];
}) {
  const [examMode, setExamMode] = useState<ExamMode>("genel");

  // Branş Denemesi course picker: a Track -> Course cascade over the full
  // curriculum, not just courses the student happens to have exam data
  // for -- a coach browsing a course with no data yet should still be
  // able to select it and see an empty state, not have it missing from
  // the list entirely.
  const [mainTrack, setMainTrack] = useState<MainTrack>("tyt");
  const [aytSubTrack, setAytSubTrack] = useState<Track>("sayisal");
  const [branchCourseId, setBranchCourseId] = useState(TYT_COURSES[0].id);

  function handleMainTrackChange(next: MainTrack) {
    setMainTrack(next);
    setBranchCourseId(next === "tyt" ? TYT_COURSES[0].id : AYT_COURSES_BY_TRACK.sayisal[0].id);
    setAytSubTrack("sayisal");
  }

  function handleAytSubTrackChange(next: Track) {
    setAytSubTrack(next);
    setBranchCourseId(AYT_COURSES_BY_TRACK[next][0].id);
  }

  const branchCourses = mainTrack === "tyt" ? TYT_COURSES : AYT_COURSES_BY_TRACK[aytSubTrack];

  // Paragraf/Problem chart date range -- paragrafEntries is already this
  // student's full, unpaginated history (fetched once server-side), so
  // filtering by range is plain client-side work, no extra fetch needed.
  const [chartRange, setChartRange] = useState<ChartRange>(LAST_30_DAYS_RANGE);

  const sortedEntries = paragrafEntries
    .filter((e) => isDateInChartRange(e.entry_date, chartRange))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const paragrafSeries = sortedEntries.map((e) => ({
    date: e.entry_date,
    a: computeNet(e.paragraf_dogru, e.paragraf_yanlis),
    b: e.paragraf_sure,
  }));
  const problemSeries = sortedEntries.map((e) => ({
    date: e.entry_date,
    a: computeNet(e.problem_dogru, e.problem_yanlis),
    b: e.problem_sure,
  }));

  // Breakdown by subject group (Türkçe/Sosyal/Matematik/Fen for TYT, or the
  // relevant AYT sections for the selected track) instead of one summed
  // total, so the coach can see exactly which section is driving the exam's
  // overall net.
  const genelGroups = mainTrack === "tyt" ? TYT_SUBJECT_GROUPS : AYT_SUBJECT_GROUPS_BY_TRACK[aytSubTrack];
  const genelSeries = seriesFor(genelGroups);
  const genelBreakdownData = generalExams
    .filter(
      (e) =>
        e.subject_scores &&
        parseGeneralExamTrack(e.title) === mainTrack &&
        (mainTrack === "tyt" || inferAytTrackFromScores(e.subject_scores) === aytSubTrack),
    )
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => ({
      date: e.task_date,
      values: Object.fromEntries(
        genelGroups.map((g) => {
          const s = e.subject_scores?.[g.key];
          return [g.key, s ? computeNet(s.correct ?? 0, s.wrong ?? 0) : 0];
        }),
      ),
    }));

  const bransChartData = branchExams
    .filter((e) => e.course_id === branchCourseId && (e.correct_count !== null || e.wrong_count !== null))
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => ({
      date: e.task_date,
      a: computeNet(e.correct_count ?? 0, e.wrong_count ?? 0),
      b: e.duration_minutes ?? 0,
    }));

  const selectedBranchCourseName = findCourseById(branchCourseId)?.name ?? branchCourseId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ChartRangePicker value={chartRange} onChange={setChartRange} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paragraf Gelişimi</CardTitle>
            <CardDescription>Net ve süre değişimi</CardDescription>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={paragrafSeries} labelA="Net" labelB="Süre" unitB=" dk" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Problem Gelişimi</CardTitle>
            <CardDescription>Net ve süre değişimi</CardDescription>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={problemSeries} labelA="Net" labelB="Süre" unitB=" dk" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Deneme Net Gelişimi</CardTitle>
            <div className="bg-secondary inline-flex rounded-lg p-1">
              {(["genel", "brans"] as ExamMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setExamMode(mode)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    examMode === mode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "genel" ? "Genel Deneme" : "Branş Denemesi"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TrackToggle
              options={[
                { value: "tyt", label: "TYT" },
                { value: "ayt", label: "AYT" },
              ]}
              value={mainTrack}
              onChange={handleMainTrackChange}
            />
            {mainTrack === "ayt" && (
              <TrackToggle
                options={(Object.keys(TRACK_LABELS) as Track[]).map((t) => ({ value: t, label: TRACK_LABELS[t] }))}
                value={aytSubTrack}
                onChange={handleAytSubTrackChange}
              />
            )}
            {examMode === "brans" && (
              <select
                className={cn(selectClassName(), "max-w-xs")}
                value={branchCourseId}
                onChange={(e) => setBranchCourseId(e.target.value)}
                aria-label="Branş dersi seç"
              >
                {branchCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <CardDescription>
            {examMode === "genel"
              ? "Bölümlerin toplam nete katkısı"
              : `${selectedBranchCourseName} branş denemesi net ve süre değişimi`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {examMode === "genel" ? (
            <StackedBarChart data={genelBreakdownData} series={genelSeries} />
          ) : bransChartData.length === 0 ? (
            <p className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
              Bu ders için henüz branş denemesi verisi yok.
            </p>
          ) : (
            <DualMetricChart data={bransChartData} labelA="Net" labelB="Süre" unitB=" dk" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
