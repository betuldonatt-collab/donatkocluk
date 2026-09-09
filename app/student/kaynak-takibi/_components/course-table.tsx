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
import type { Course, Topic } from "@/lib/curriculum";

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

type Row = { topic: Topic; unitLabel: string; unitRowSpan: number | null };

// "-" (ünitesiz/bağımsız konu) satırları birleştirilmez — her biri kendi
// tek satırlık "-" hücresini alır. Gerçek bir ünite adı olan gruplarda ise
// ardışık konular tek bir rowSpan'lı hücrede birleşir.
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

const ZERO_STAT: TopicStat = { total: 0, correct: 0, wrong: 0, empty: 0 };

export function CourseTable({
  course,
  resources,
  progress,
  topicStats,
  onAddResource,
  onToggle,
}: {
  course: Course;
  resources: Resource[];
  progress: ProgressMap;
  topicStats: CourseTopicStats;
  onAddResource: (name: string) => Promise<void>;
  onToggle: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
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
                  className="text-foreground border-l text-center font-semibold"
                >
                  {resource.name}
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
                        <span className="[writing-mode:vertical-rl] rotate-180 font-medium">
                          {row.unitLabel}
                        </span>
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
                specific topic (topic_id null), so this course's topic
                rows plus this one always sum to its true total with no
                discrepancy. Always shown, even at zero, so it reads as a
                fixed part of the table rather than something that
                appears/disappears. */}
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
