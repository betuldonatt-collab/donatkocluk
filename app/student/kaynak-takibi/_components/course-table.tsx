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

function progressKey(topicId: string, resourceId: string) {
  return `${topicId}::${resourceId}`;
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

export function CourseTable({
  course,
  resources,
  progress,
  onAddResource,
  onToggle,
}: {
  course: Course;
  resources: Resource[];
  progress: ProgressMap;
  onAddResource: (name: string) => void;
  onToggle: (topicId: string, resourceId: string, field: "solved" | "reviewed") => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newResourceName, setNewResourceName] = useState("");

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="w-12 align-bottom">
                Ünite
              </TableHead>
              <TableHead rowSpan={2} className="align-bottom">
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
            {resources.length > 0 && (
              <TableRow>
                {resources.map((resource) => (
                  <Fragment key={resource.id}>
                    <TableHead className="border-l text-center">Soru Çözümü</TableHead>
                    <TableHead className="text-center">Yanlışlara Dönüş</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.topic.id}>
                {row.unitRowSpan !== null && (
                  <TableCell
                    rowSpan={row.unitRowSpan}
                    className={cn("border-r p-0 text-center align-middle", row.unitRowSpan === 1 && "text-muted-foreground")}
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
                <TableCell className="font-medium whitespace-normal">{row.topic.name}</TableCell>
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
                          aria-label={`${course.name} - ${row.topic.name} - ${resource.name} - Yanlışlara Dönüş`}
                        />
                      </TableCell>
                    </Fragment>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>

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
            <Button type="button" disabled={!newResourceName.trim()} onClick={handleAdd}>
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
