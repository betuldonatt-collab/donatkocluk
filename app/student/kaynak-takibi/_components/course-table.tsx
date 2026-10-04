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
import {
  MAARIF_KONU_STICKY_LEFT_CLASS,
  MAARIF_STAT_HEAD_CLASSES,
  MAARIF_UNIT_COL_CLASS,
  MaarifStatCells,
  MaarifTableBody,
} from "@/components/maarif-table-body";
import { collapsePipelineMapForRows, type PipelineBinding } from "@/lib/topic-pipeline";
import { isMaarifCourseId, type Course } from "@/lib/curriculum";
import { flattenSelectionRows, isFlatRows } from "@/lib/curriculum/rows";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";

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

// Sums a row's stat across every real topic id it rolls up (see
// flattenSelectionRows) -- 1 id for a plain/ungrouped row, so this is a
// no-op lookup everywhere except a rolled-up LGS row.
function aggregateStat(byTopic: Record<string, TopicStat>, topicIds: string[]): TopicStat {
  return topicIds.reduce(
    (acc, id) => {
      const s = byTopic[id];
      return s ? { total: acc.total + s.total, correct: acc.correct + s.correct, wrong: acc.wrong + s.wrong, empty: acc.empty + s.empty } : acc;
    },
    { total: 0, correct: 0, wrong: 0, empty: 0 },
  );
}

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

  // One row per checkable/selectable unit -- an LGS course rolls up its
  // Konu/Ünite level here (see lib/curriculum/lgs-selection.ts), so this is
  // never one row per raw Alt Konu/topic for those courses; everything
  // else (YKS, Maarif) renders exactly as many rows as it always did.
  const rows = flattenSelectionRows(course);
  const isMaarif = isMaarifCourseId(course.id);
  // A flat Maarif TYT course (Türkçe) has no Ünite column.
  const flat = isFlatRows(rows);
  // A Maarif unit's Okul İlerlemesi is ticked per subtopic, so it folds with
  // AND (unit done only when every subtopic is) for the summary bar.
  const collapsedMap = pipeline && collapsePipelineMapForRows(rows, pipeline.map, pipeline.config, isMaarif ? ["okul_ilerlemesi"] : []);
  const collapsedPipeline = pipeline && collapsedMap && { ...pipeline, map: collapsedMap };
  // Maarif courses render as a spreadsheet-style grid (MaarifTableBody);
  // every other cohort keeps the generic one-row-per-selection-row body.
  const maarifPipeline = isMaarif && pipeline && collapsedMap ? { raw: pipeline, collapsedMap } : null;

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
        {collapsedPipeline && <PipelineSummaryBar course={course} map={collapsedPipeline.map} config={collapsedPipeline.config} />}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={4} className="text-center font-semibold">
                Soru Dağılımı
              </TableHead>
              {!flat && (
                <TableHead
                  className={cn("bg-background sticky left-0 z-20 border-l align-bottom", isMaarif ? MAARIF_UNIT_COL_CLASS : "w-12")}
                  rowSpan={2}
                >
                  Ünite
                </TableHead>
              )}
              <TableHead
                className={cn("bg-background sticky z-20 border-r align-bottom", isMaarif ? (flat ? "left-0" : MAARIF_KONU_STICKY_LEFT_CLASS) : "left-12")}
                rowSpan={2}
              >
                Konu
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
              <TableHead className={cn("text-center text-xs", isMaarif && MAARIF_STAT_HEAD_CLASSES.total)}>Toplam</TableHead>
              <TableHead className={cn("text-center text-xs text-emerald-700", isMaarif && MAARIF_STAT_HEAD_CLASSES.count)}>D</TableHead>
              <TableHead className={cn("text-center text-xs text-rose-700", isMaarif && MAARIF_STAT_HEAD_CLASSES.count)}>Y</TableHead>
              <TableHead className={cn("text-center text-xs text-amber-700", isMaarif && MAARIF_STAT_HEAD_CLASSES.count)}>B</TableHead>
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
            {maarifPipeline ? (
              <MaarifTableBody
                courseName={course.name}
                rows={rows}
                resources={resources}
                progress={progress}
                topicStats={topicStats.byTopic}
                pipeline={maarifPipeline.raw}
                collapsedMap={maarifPipeline.collapsedMap}
                onToggleProgress={onToggle}
              />
            ) : rows.map((row) => (
              <TableRow key={row.id}>
                <StatCells stat={aggregateStat(topicStats.byTopic, row.memberTopicIds)} />
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
                <TableCell className="bg-card sticky left-12 z-10 border-r font-medium whitespace-normal">
                  {row.label}
                  {/* Every subtopic this selectable row rolls up, shown as
                      plain read-only chips -- nothing here is its own
                      checkbox anymore, it's just what "{row.label}" covers. */}
                  <ReadOnlySubtopics names={row.readOnlyNames} />
                </TableCell>
                {collapsedPipeline && (
                  <PipelineCells
                    steps={collapsedPipeline.config.start}
                    courseName={course.name}
                    topicName={row.label}
                    topicId={row.id}
                    map={collapsedPipeline.map}
                    onToggle={collapsedPipeline.onToggle}
                  />
                )}
                {resources.map((resource) => {
                  const solved = row.memberTopicIds.some((id) => progress[progressKey(id, resource.id)]?.solved);
                  const reviewed = row.memberTopicIds.some((id) => progress[progressKey(id, resource.id)]?.reviewed);
                  return (
                    <Fragment key={resource.id}>
                      <TableCell className="border-l text-center">
                        <Checkbox
                          checked={solved}
                          onCheckedChange={() => onToggle(row.id, resource.id, "solved")}
                          aria-label={`${course.name} - ${row.label} - ${resource.name} - Soru Çözümü`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={reviewed}
                          onCheckedChange={() => onToggle(row.id, resource.id, "reviewed")}
                          aria-label={`${course.name} - ${row.label} - ${resource.name} - Kaynak Taraması Yapıldı`}
                        />
                      </TableCell>
                    </Fragment>
                  );
                })}
                {collapsedPipeline && (
                  <PipelineCells
                    steps={collapsedPipeline.config.end}
                    courseName={course.name}
                    topicName={row.label}
                    topicId={row.id}
                    map={collapsedPipeline.map}
                    onToggle={collapsedPipeline.onToggle}
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
              {isMaarif ? <MaarifStatCells stat={topicStats.karma} /> : <StatCells stat={topicStats.karma} />}
              <TableCell colSpan={2} className="bg-muted/40 sticky left-0 z-10 border-l font-medium whitespace-normal italic">
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
