"use client";

import { Fragment, useState } from "react";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Course, Topic } from "@/lib/curriculum";
import type { CourseTopicStats, ResourceProgressMap, ResourceRef, TopicStat } from "./kaynak-takibi-tab";

function progressKey(topicId: string, resourceId: string) {
  return `${topicId}::${resourceId}`;
}

const ZERO_STAT: TopicStat = { total: 0, correct: 0, wrong: 0, empty: 0 };

// Compact Toplam/D/Y/B cluster reused for every topic row and the Karma
// row at the bottom -- mirrors the student side's own StatCells
// (course-table.tsx) so the two panels read identically.
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

type Row = { topic: Topic; unitLabel: string; unitRowSpan: number | null };

function flattenRows(course: Course): Row[] {
  const rows: Row[] = [];
  for (const group of course.units) {
    if (group.unit === "-") {
      for (const topic of group.topics) {
        rows.push({ topic, unitLabel: "-", unitRowSpan: 1 });
      }
    } else {
      group.topics.forEach((topic, i) => {
        rows.push({ topic, unitLabel: group.unit, unitRowSpan: i === 0 ? group.topics.length : null });
      });
    }
  }
  return rows;
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
      setDeleteError(e instanceof Error ? e.message : "Bir hata oluştu.");
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

  const rows = flattenRows(course);

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
                <TableHead className="bg-background sticky left-12 z-20 border-r align-bottom" rowSpan={2}>
                  Konu
                </TableHead>
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
                          <span className="[writing-mode:vertical-rl] rotate-180 font-medium">{row.unitLabel}</span>
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="bg-card sticky left-12 z-10 border-r font-medium whitespace-normal">{row.topic.name}</TableCell>
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
                </TableRow>
              ))}
              {/* Permanent row -- catches every scored task logged without a
                  specific topic (topic_id null), so this course's topic rows
                  plus this one always sum to its true total with no
                  discrepancy. */}
              <TableRow className="bg-muted/40">
                <StatCells stat={topicStats.karma} />
                <TableCell colSpan={2} className="bg-muted/40 sticky left-0 z-10 border-l font-medium whitespace-normal italic">
                  Karma
                </TableCell>
                {resources.map((resource) => (
                  <TableCell key={resource.id} colSpan={2} className="border-l" />
                ))}
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
