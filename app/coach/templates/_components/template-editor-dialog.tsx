"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ExamType } from "@/lib/exam-type";
import {
  TEMPLATE_DAY_LABELS_SHORT,
  countTemplateTasks,
  describeDays,
  summarizeTemplateTask,
} from "@/lib/weekly-template";
import { saveWeeklyTemplate, type WeeklyTemplate } from "../../actions";
import { TemplateItemForm, type TemplateItemDraft } from "./template-item-form";

// Create / edit one weekly template: a name, the cohort, and a list of items
// (each a task or routine + the weekdays it repeats on). Two views in one
// dialog -- the list, and the add/edit form for a single item -- so the coach
// never leaves the template while building it.

// How many cards land on each weekday (Pzt..Paz) -- the at-a-glance "does this
// week look right" strip under the item list.
function perDayCounts(items: TemplateItemDraft[]): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => countTemplateTasks(items.filter((i) => i.days.includes(d)).map((i) => ({ ...i, days: [d] }))));
}

export function TemplateEditorDialog({
  template,
  onClose,
  onSaved,
}: {
  // null = create a new template.
  template: WeeklyTemplate | null;
  onClose: () => void;
  onSaved: (template: WeeklyTemplate) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [examType, setExamType] = useState<ExamType>(template?.examType ?? "LGS");
  const [items, setItems] = useState<TemplateItemDraft[]>(template?.items.map((i) => ({ days: i.days, task: i.task })) ?? []);
  // undefined = list view, null = adding a new item, number = editing items[n].
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function changeExamType(next: ExamType) {
    if (next === examType) return;
    // Tasks are cohort-specific (LGS/YKS courses), so switching drops them --
    // ask first when there is something to lose.
    if (items.length > 0 && !window.confirm("Sınav türünü değiştirirsen şablondaki görevler silinir. Devam edilsin mi?")) return;
    setItems([]);
    setExamType(next);
  }

  function handleItemSubmit(item: TemplateItemDraft) {
    setItems((prev) => (editing === null || editing === undefined ? [...prev, item] : prev.map((p, i) => (i === editing ? item : p))));
    setEditing(undefined);
  }

  function handleSave() {
    if (!name.trim()) {
      setError("Şablona bir isim ver.");
      return;
    }
    if (items.length === 0) {
      setError("Şablona en az bir görev ekle.");
      return;
    }
    setError(null);
    startSaving(async () => {
      const result = await saveWeeklyTemplate({ id: template?.id, name, examType, items });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Şablon kaydedildi.");
      onSaved(result.data);
    });
  }

  const counts = perDayCounts(items);
  const total = countTemplateTasks(items);

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing !== undefined ? (editing === null ? "Şablona Görev Ekle" : "Görevi Düzenle") : template ? "Şablonu Düzenle" : "Yeni Haftalık Şablon"}
          </DialogTitle>
        </DialogHeader>

        {editing !== undefined ? (
          <TemplateItemForm
            initial={editing === null ? null : items[editing]}
            examType={examType}
            onCancel={() => setEditing(undefined)}
            onSubmit={handleItemSubmit}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Şablon adı</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn. LGS Temel Hafta"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Öğrenci türü</Label>
                <div className="bg-secondary inline-flex rounded-lg p-1">
                  {(["LGS", "YKS"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeExamType(t)}
                      className={cn(
                        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                        examType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Görevler ve rutinler</Label>
                <Button type="button" size="sm" onClick={() => setEditing(null)}>
                  <Plus className="size-4" />
                  Görev / Rutin Ekle
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                  Henüz görev yok. Her gün tekrar eden bir rutin (ör. 15 sayfa kitap okuma) veya belirli günlerde bir görev ekleyerek başla.
                </p>
              ) : (
                <ul className="divide-border border-border divide-y rounded-lg border">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-medium">{summarizeTemplateTask(item.task)}</p>
                        <p className="text-muted-foreground text-xs">{describeDays(item.days)}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label="Düzenle">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Kaldır"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">Haftaya dağılım ({total} görev)</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {TEMPLATE_DAY_LABELS_SHORT.map((label, d) => (
                    <div key={label} className="bg-muted rounded-md px-1 py-1.5 text-center">
                      <p className="text-muted-foreground text-[11px]">{label}</p>
                      <p className="text-foreground text-sm font-semibold tabular-nums">{counts[d]}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                İptal
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Kaydediliyor..." : "Şablonu Kaydet"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
