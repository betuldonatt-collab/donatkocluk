"use client";

import { Fragment, useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PipelineCells, PipelineFillerCell, PipelineStepHeads, PipelineSummaryBar } from "@/components/topic-pipeline";
import {
  MAARIF_KONU_STICKY_LEFT_CLASS,
  MAARIF_STAT_HEAD_CLASSES,
  MAARIF_UNIT_COL_CLASS,
  MaarifStatCells,
  MaarifTableBody,
} from "@/components/maarif-table-body";
import { collapsePipelineMapForRows, inheritUnitLevelSteps, perTopicStepsFor, type PipelineBinding } from "@/lib/topic-pipeline";
import { useMaarifGrade } from "@/components/maarif-grade-context";
import { isMaarifCourseId, type Course } from "@/lib/curriculum";
import { isFlatRows, kaynakTakibiRows } from "@/lib/curriculum/rows";
import { groupParentLayout, sumTopicStats, unitLevelGroups } from "@/lib/curriculum/topic-groups";
import { TopicGroupParentRow } from "@/components/topic-group-parent-row";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import type { CourseTopicStats, ResourceProgressMap, ResourceRef, TopicStat } from "./kaynak-takibi-tab";

function progressKey(topicId: string, resourceId: string) {
  return `${topicId}::${resourceId}`;
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

// Compact Toplam/D/Y/B cluster reused for every topic row and the Karma
// row at the bottom -- mirrors the student side's own StatCells
// (course-table.tsx) so the two panels read identically.
function StatCells({ stat, rowSpan }: { stat: TopicStat; rowSpan?: number }) {
  // A genuine 0 (e.g. 0 wrong on a topic that WAS attempted) must render as
  // "0", not "–" -- only a topic with no recorded total at all is "no data".
  const hasData = stat.total > 0;
  return (
    <>
      <TableCell rowSpan={rowSpan} className={cn("text-center font-medium tabular-nums", rowSpan && "align-middle")}>{hasData ? stat.total : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn("text-center tabular-nums text-emerald-700", rowSpan && "align-middle")}>{hasData ? stat.correct : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn("text-center tabular-nums text-rose-700", rowSpan && "align-middle")}>{hasData ? stat.wrong : "–"}</TableCell>
      <TableCell rowSpan={rowSpan} className={cn("text-center tabular-nums text-amber-700", rowSpan && "align-middle")}>{hasData ? stat.empty : "–"}</TableCell>
    </>
  );
}

// Coach-editable mirror of the student's Kaynak Takibi course table --
// same row/column structure, but the coach can add resources and toggle
// checkboxes on the student's behalf. Always renders the full syllabus
// topic list (even with zero resources logged yet), unlike the earlier
// read-only version which hid the whole table until a resource existed.
export function EditableCourseTable({
  course,
  resources,
  progress,
  topicStats,
  onAddResource,
  onToggle,
  onArchiveResource,
  onReactivateResource,
  onDeleteResource,
  pipeline,
}: {
  course: Course;
  resources: ResourceRef[];
  progress: ResourceProgressMap;
  topicStats: CourseTopicStats;
  onAddResource: (name: string) => void;
  onToggle: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
  // All coach-only actions -- the student side never renders this table,
  // so there's no risk of any of these appearing in the student's own view.
  onArchiveResource: (resourceId: string) => void;
  onReactivateResource: (resourceId: string) => void;
  onDeleteResource: (resourceId: string) => Promise<void>;
  // The per-topic pipeline checkboxes: the cohort's "start" steps sit right
  // after the topic name, its "end" steps after the last resource column.
  pipeline?: PipelineBinding;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newResourceName, setNewResourceName] = useState("");
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleConfirmArchive() {
    if (!pendingArchiveId) return;
    onArchiveResource(pendingArchiveId);
    setPendingArchiveId(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteResource(pendingDeleteId);
      setPendingDeleteId(null);
    } catch (e) {
      // deleteStudentResource (app/coach/actions.ts) is now an
      // unconditional hard delete -- an error here means a real failure
      // (network, RLS rejection), not the old "has data" guard, which no
      // longer exists.
      setDeleteError(friendlyError(e, "Bir hata oluştu."));
    } finally {
      setDeleting(false);
    }
  }

  function handleAdd() {
    const name = newResourceName.trim();
    if (!name) return;
    onAddResource(name);
    setNewResourceName("");
    setDialogOpen(false);
  }

  // One row per checkable/selectable unit -- an LGS course rolls up its
  // Konu/Ünite level here (see lib/curriculum/lgs-selection.ts), so this is
  // never one row per raw Alt Konu/topic for those courses; everything
  // else (YKS, Maarif) renders exactly as many rows as it always did.
  const rows = kaynakTakibiRows(course);
  // A grouped unit (Problemler, Dalgalar, Trigonometri, ...) gets a parent row with the whole group's cumulative stats.
  const { parentBefore, unitSpan, hideRowStats } = groupParentLayout(course, rows);
  // LGS Fen Bilimleri is laid out per unit: its master / parent row is not shown; the Soru Dağılımı block and the resource /
  // MEB / Çıkmış Sorular checkboxes are one merged cell per unit (rowSpan over its Konu rows), the master holding the
  // unit-level ticks; Konu, Okul İlerlemesi and Konu Tekrarı stay one row per Konu.
  const unitLevel = unitLevelGroups(course);
  const unitOf = (row: { unitLabel: string }) => unitLevel.get(row.unitLabel);
  const isMaarif = isMaarifCourseId(course.id);
  const maarifGrade = useMaarifGrade();
  // A flat Maarif TYT course (Türkçe) has no Ünite column.
  const flat = isFlatRows(rows);
  // A Maarif unit's Okul İlerlemesi is ticked per subtopic, so it folds with
  // AND (unit done only when every subtopic is) for the summary bar.
  const collapsedMap =
    pipeline &&
    inheritUnitLevelSteps(
      collapsePipelineMapForRows(rows, pipeline.map, pipeline.config, isMaarif ? perTopicStepsFor(maarifGrade) : []),
      rows,
      pipeline.map,
      pipeline.config.end,
      new Map([...unitLevel].map(([label, u]) => [label, u.masterId])),
    );
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
                    className={cn("text-foreground border-l text-center font-semibold", !resource.is_active && "opacity-60")}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="inline-flex items-center gap-1">
                        {resource.name}
                        {!resource.is_active && (
                          <span className="text-muted-foreground text-[9px] font-normal whitespace-nowrap">(Arşivlendi)</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {resource.is_active ? (
                          <button
                            type="button"
                            onClick={() => setPendingArchiveId(resource.id)}
                            aria-label={`${resource.name} kaynağını arşivle`}
                            className="text-muted-foreground hover:text-amber-600 shrink-0 rounded p-0.5"
                          >
                            <Archive className="size-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onReactivateResource(resource.id)}
                            aria-label={`${resource.name} kaynağını aktif et`}
                            className="text-muted-foreground hover:text-emerald-600 shrink-0 rounded p-0.5"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(resource.id)}
                          aria-label={`${resource.name} kaynağını kalıcı sil`}
                          className="text-muted-foreground hover:text-destructive shrink-0 rounded p-0.5"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
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
                <Fragment key={row.id}>
                {parentBefore.get(row.id) && (
                  <TopicGroupParentRow
                    label={parentBefore.get(row.id)!.unitLabel}
                stat={sumTopicStats(topicStats.byTopic, parentBefore.get(row.id)!.memberTopicIds)}
                    unitRowSpan={parentBefore.get(row.id)!.unitRowSpan}
                    statRowSpan={parentBefore.get(row.id)!.aggregatedStats ? parentBefore.get(row.id)!.unitRowSpan : undefined}
                    resourceCount={resources.length}
                    startFiller={pipeline ? pipeline.config.start.length : 0}
                    endFiller={pipeline ? pipeline.config.end.length : 0}
                  />
                )}
                <TableRow>
                  {unitOf(row) ? (
                    row.unitRowSpan !== null && (
                      <StatCells stat={sumTopicStats(topicStats.byTopic, unitOf(row)!.topicIds)} rowSpan={row.unitRowSpan} />
                    )
                  ) : (
                    !hideRowStats(row) && <StatCells stat={aggregateStat(topicStats.byTopic, row.memberTopicIds)} />
                  )}
                  {unitSpan(row) !== null && (
                    <TableCell
                      rowSpan={unitSpan(row)!}
                      className={cn(
                        "bg-card sticky left-0 z-10 border-l border-r p-0 text-center align-middle",
                        unitSpan(row) === 1 && "text-muted-foreground",
                      )}
                    >
                      {row.unitLabel === "-" ? (
                        "-"
                      ) : (
                        <div className="flex h-full items-center justify-center py-2">
                          <span className="[writing-mode:vertical-rl] rotate-180 font-medium">{row.unitLabel}</span>
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
                    // LGS Fen: one merged pair of checkboxes per unit, on the first Konu row, bound to the unit's master.
                    const unit = unitOf(row);
                    if (unit) {
                      if (row.unitRowSpan === null) return null;
                      return (
                        <Fragment key={resource.id}>
                          <TableCell rowSpan={row.unitRowSpan} className="border-l text-center align-middle">
                            <Checkbox
                              checked={progress[progressKey(unit.masterId, resource.id)]?.solved ?? false}
                              onCheckedChange={() => onToggle(unit.masterId, resource.id, "solved")}
                              aria-label={`${course.name} - ${row.unitLabel} - ${resource.name} - Soru Çözümü`}
                            />
                          </TableCell>
                          <TableCell rowSpan={row.unitRowSpan} className="text-center align-middle">
                            <Checkbox
                              checked={progress[progressKey(unit.masterId, resource.id)]?.reviewed ?? false}
                              onCheckedChange={() => onToggle(unit.masterId, resource.id, "reviewed")}
                              aria-label={`${course.name} - ${row.unitLabel} - ${resource.name} - Kaynak Taraması Yapıldı`}
                            />
                          </TableCell>
                        </Fragment>
                      );
                    }
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
                  {collapsedPipeline &&
                    (unitOf(row) ? (
                      // LGS Fen: the unit's own MEB Kaynağı / Çıkmış Sorular, one merged cell per unit.
                      row.unitRowSpan !== null && pipeline && (
                        <PipelineCells
                          steps={pipeline.config.end}
                          courseName={course.name}
                          topicName={row.unitLabel}
                          topicId={unitOf(row)!.masterId}
                          map={pipeline.map}
                          onToggle={pipeline.onToggle}
                          rowSpan={row.unitRowSpan}
                        />
                      )
                    ) : (
                      <PipelineCells
                        steps={collapsedPipeline.config.end}
                        courseName={course.name}
                        topicName={row.label}
                        topicId={row.id}
                        map={collapsedPipeline.map}
                        onToggle={collapsedPipeline.onToggle}
                      />
                    ))}
                </TableRow>
              </Fragment>
              ))}
              {/* Permanent row -- catches every scored task logged without a
                  specific topic (topic_id null), so this course's topic rows
                  plus this one always sum to its true total with no
                  discrepancy. */}
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
            Öğrenci bu ders için henüz kaynak eklemedi. Takip başlatmak için &quot;Kaynak Ekle&quot;ye tıkla.
          </p>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynak Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="coach-resource-name">Kaynak adı</Label>
            <Input
              id="coach-resource-name"
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
            <Button type="button" disabled={!newResourceName.trim()} onClick={handleAdd}>
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingArchiveId !== null} onOpenChange={(open) => !open && setPendingArchiveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynağı Arşivle</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Bu kaynak yeni görev atarken artık seçilemeyecek, ancak öğrencinin bu kaynağa ait tüm geçmiş verisi (işaretli
            konular, çözülen sorular) korunacak. İstediğin zaman tekrar aktif edebilirsin.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingArchiveId(null)}>
              İptal
            </Button>
            <Button type="button" onClick={handleConfirmArchive}>
              Arşivle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynağı Kalıcı Sil</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Bu kaynağı <strong className="text-foreground">kalıcı olarak</strong> silmek istediğine emin misin? Bu kaynağa
            bağlı tüm görev bağlantıları ve işaretlenmiş ilerleme (soru çözümü, kaynak taraması) de birlikte silinir. Bu
            işlem geri alınamaz. Geçmişi korumak istiyorsan bunun yerine arşivle.
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)} disabled={deleting}>
              İptal
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Siliniyor..." : "Kalıcı Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
