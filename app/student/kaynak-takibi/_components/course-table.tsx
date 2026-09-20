"use client";

import { Fragment, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PipelineCells, PipelineFillerCell, PipelineStepHeads, PipelineSummaryBar } from "@/components/topic-pipeline";
import type { PipelineBinding } from "@/lib/topic-pipeline";
import type { Course } from "@/lib/curriculum";
import { courseHasKonu, flattenCourseRows } from "@/lib/curriculum/rows";

export type Resource = { id: string; name: string };
export type ProgressMap = Record<string, { solved: boolean; reviewed: boolean }>;
export type TopicStat = { total: number; correct: number; wrong: number; empty: number };
export type CourseTopicStats = { byTopic: Record<string, TopicStat>; karma: TopicStat };

function progressKey(topicId: string, resourceId: string) {
  return `${topicId}::${resourceId}`;
}

// Compact Toplam/D/Y/B cluster reused for every topic row and the Karma
// row at the bottom -- deliberately terse (single-letter D/Y/B column
// heads) since it repeats on every single row of a long topic list.
function StatCells({ stat }: { stat: TopicStat }) {
  // A genuine 0 (e.g. 0 wrong on a topic that WAS attempted) must render as
  // "0", not "–" -- only a topic with no recorded total at all is "no data".
  const hasData = stat.total > 0;
  return (
    <>
      <TableCell className="text-center font-medium tabular-nums">{hasData ? stat.total : "–"}</TableCell>
      <TableCell className="text-center tabular-nums text-emerald-700">{hasData ? stat.correct : "–"}</TableCell>
      <TableCell className="text-center tabular-nums text-rose-700">{hasData ? stat.wrong : "–"}</TableCell>
      <TableCell className="text-center tabular-nums text-amber-700">{hasData ? stat.empty : "–"}</TableCell>
    </>
  );
}

const ZERO_STAT: TopicStat = { total: 0, correct: 0, wrong: 0, empty: 0 };

export function CourseTable({
  course,
  resources,
  progress,
  topicStats,
  onAddResource,
  onToggle,
  pipeline,
}: {
  course: Course;
  resources: Resource[];
  progress: ProgressMap;
  topicStats: CourseTopicStats;
  onAddResource: (name: string) => Promise<void>;
  onToggle: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
  // The per-topic pipeline checkboxes: the cohort's "start" steps sit right
  // after the topic name, its "end" steps after the last resource column.
  pipeline?: PipelineBinding;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newResourceName, setNewResourceName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const name = newResourceName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await onAddResource(name);
      // Only clear/close on success -- a failed add keeps the dialog open
      // with what the student typed still intact, instead of silently
      // discarding it.
      setNewResourceName("");
      setDialogOpen(false);
    } catch {
      // onAddResource already surfaced a toast; nothing else to do here.
    } finally {
      setSaving(false);
    }
  }

  // "-" (ünitesiz) topics never merge; real units span their topic count.
  // An LGS course with a Konu level (Matematik) gets a third column between
  // Ünite and the topic (then an "Alt Konu"), so all three levels show.
  const rows = flattenCourseRows(course);
  const hasKonu = courseHasKonu(course);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{course.name}</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Kaynak Ekle
        </Button>
      </CardHeader>
      <CardContent>
        {pipeline && <PipelineSummaryBar course={course} map={pipeline.map} config={pipeline.config} />}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={4} className="text-center font-semibold">
                Soru Dağılımı
              </TableHead>
              <TableHead className="bg-background sticky left-0 z-20 border-l w-12 align-bottom" rowSpan={2}>
                Ünite
              </TableHead>
              {hasKonu && (
                <TableHead className="bg-background sticky left-12 z-20 w-44 min-w-44 border-r align-bottom" rowSpan={2}>
                  Konu
                </TableHead>
              )}
              <TableHead
                className={cn("bg-background sticky z-20 border-r align-bottom", hasKonu ? "left-[14rem]" : "left-12")}
                rowSpan={2}
              >
                {hasKonu ? "Alt Konu" : "Konu"}
              </TableHead>
              {pipeline && <PipelineStepHeads steps={pipeline.config.start} />}
              {resources.map((resource) => (
                <TableHead
                  key={resource.id}
                  colSpan={2}
                  className="text-foreground border-l text-center font-semibold"
                >
                  {resource.name}
                </TableHead>
              ))}
              {pipeline && <PipelineStepHeads steps={pipeline.config.end} />}
            </TableRow>
            <TableRow>
              <TableHead className="text-center text-xs">Toplam</TableHead>
              <TableHead className="text-center text-xs text-emerald-700">D</TableHead>
              <TableHead className="text-center text-xs text-rose-700">Y</TableHead>
              <TableHead className="text-center text-xs text-amber-700">B</TableHead>
              {resources.map((resource) => (
                <Fragment key={resource.id}>
                  <TableHead className="border-l h-auto py-2 text-center whitespace-normal">
                    Soru
                    <br />
                    Çözümü
                  </TableHead>
                  <TableHead className="h-auto py-2 text-center whitespace-normal">
                    Kaynak Taraması
                    <br />
                    Yapıldı
                  </TableHead>
                </Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.topic.id}>
                <StatCells stat={topicStats.byTopic[row.topic.id] ?? ZERO_STAT} />
                {row.unitRowSpan !== null && (
                  <TableCell
                    rowSpan={row.unitRowSpan}
                    className={cn(
                      "bg-card sticky left-0 z-10 border-l border-r p-0 text-center align-middle",
                      row.unitRowSpan === 1 && "text-muted-foreground",
                    )}
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
                {hasKonu && row.konuRowSpan !== null && (
                  <TableCell
                    rowSpan={row.konuRowSpan}
                    className="bg-card sticky left-12 z-10 w-44 min-w-44 border-r align-middle font-medium whitespace-normal"
                  >
                    {row.konuLabel}
                  </TableCell>
                )}
                <TableCell
                  // A topic with no Konu of its own (a 2-level subject
                  // inside a course that has some Konu rows) spans both
                  // columns instead of leaving the Konu one empty.
                  colSpan={hasKonu && row.konuLabel === null ? 2 : 1}
                  className={cn(
                    "bg-card sticky z-10 border-r font-medium whitespace-normal",
                    hasKonu && row.konuLabel !== null ? "left-[14rem]" : "left-12",
                  )}
                >
                  {row.topic.name}
                </TableCell>
                {pipeline && (
                  <PipelineCells
                    steps={pipeline.config.start}
                    courseName={course.name}
                    topicName={row.topic.name}
                    topicId={row.topic.id}
                    map={pipeline.map}
                    onToggle={pipeline.onToggle}
                  />
                )}
                {resources.map((resource) => {
                  const key = progressKey(row.topic.id, resource.id);
                  const state = progress[key] ?? { solved: false, reviewed: false };
                  return (
                    <Fragment key={resource.id}>
                      <TableCell className="border-l text-center">
                        <Checkbox
                          checked={state.solved}
                          onCheckedChange={() => onToggle(row.topic.id, resource.id, "solved")}
                          aria-label={`${course.name} - ${row.topic.name} - ${resource.name} - Soru Çözümü`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={state.reviewed}
                          onCheckedChange={() => onToggle(row.topic.id, resource.id, "reviewed")}
                          aria-label={`${course.name} - ${row.topic.name} - ${resource.name} - Kaynak Taraması Yapıldı`}
                        />
                      </TableCell>
                    </Fragment>
                  );
                })}
                {pipeline && (
                  <PipelineCells
                    steps={pipeline.config.end}
                    courseName={course.name}
                    topicName={row.topic.name}
                    topicId={row.topic.id}
                    map={pipeline.map}
                    onToggle={pipeline.onToggle}
                  />
                )}
              </TableRow>
            ))}
            {/* Permanent row -- catches every scored task logged without a
                specific topic (topic_id null), so this course's topic
                rows plus this one always sum to its true total with no
                discrepancy. Always shown, even at zero, so it reads as a
                fixed part of the table rather than something that
                appears/disappears. */}
            <TableRow className="bg-muted/40">
              <StatCells stat={topicStats.karma} />
              <TableCell colSpan={hasKonu ? 3 : 2} className="bg-muted/40 sticky left-0 z-10 border-l font-medium whitespace-normal italic">
                Karma
              </TableCell>
              {pipeline && <PipelineFillerCell count={pipeline.config.start.length} />}
              {resources.map((resource) => (
                <TableCell key={resource.id} colSpan={2} className="border-l" />
              ))}
              {pipeline && <PipelineFillerCell count={pipeline.config.end.length} />}
            </TableRow>
          </TableBody>
        </Table>
        </div>

        {resources.length === 0 && (
          <p className="text-muted-foreground mt-3 text-sm">
            Henüz kaynak eklenmedi. Takip başlatmak için &quot;Kaynak Ekle&quot;ye tıkla.
          </p>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynak Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resource-name">Kaynak adı</Label>
            <Input
              id="resource-name"
              placeholder="Örn: Acil Yayınları TYT Matematik Soru Bankası"
              value={newResourceName}
              onChange={(e) => setNewResourceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button type="button" disabled={saving || !newResourceName.trim()} onClick={handleAdd}>
              {saving ? "Ekleniyor..." : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
