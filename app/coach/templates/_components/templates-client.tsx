"use client";

import { useState, useTransition } from "react";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { TEMPLATE_DAY_LABELS_SHORT, countTemplateTasks, describeDays, summarizeTemplateTask } from "@/lib/weekly-template";
import { deleteWeeklyTemplate, type WeeklyTemplate } from "../../actions";
import { TemplateEditorDialog } from "./template-editor-dialog";

// Tiny Pzt..Paz strip: a dot per weekday that has at least one task.
function WeekStrip({ template }: { template: WeeklyTemplate }) {
  const used = new Set(template.items.flatMap((i) => i.days));
  return (
    <div className="flex gap-1">
      {TEMPLATE_DAY_LABELS_SHORT.map((label, d) => (
        <span
          key={label}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-medium",
            used.has(d) ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground/60",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function TemplatesClient({ initialTemplates }: { initialTemplates: WeeklyTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  // undefined = closed, null = new, template = edit.
  const [editing, setEditing] = useState<WeeklyTemplate | null | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, startDeleting] = useTransition();

  function handleSaved(saved: WeeklyTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev];
    });
    setEditing(undefined);
  }

  function handleDelete(id: string) {
    startDeleting(async () => {
      const result = await deleteWeeklyTemplate(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
      toast.success("Şablon silindi. Öğrencilere daha önce eklenen görevler etkilenmedi.");
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={() => setEditing(null)}>
          <Plus className="size-4" />
          Yeni Şablon
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Henüz şablonun yok"
          description="Sık tekrar eden haftalık programını bir kez kur (ör. 'LGS Temel Hafta'), sonra öğrencinin sayfasından tek tıkla uygula."
          action={
            <Button type="button" onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              İlk Şablonu Oluştur
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground truncate font-semibold">{t.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {t.examType} · {countTemplateTasks(t.items)} görev / hafta
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(t)} aria-label="Düzenle">
                      <Pencil className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmDeleteId(t.id)} aria-label="Sil">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <WeekStrip template={t} />

                <ul className="text-muted-foreground space-y-0.5 text-xs">
                  {t.items.slice(0, 4).map((item) => (
                    <li key={item.id} className="truncate">
                      <span className="text-foreground">{summarizeTemplateTask(item.task)}</span> — {describeDays(item.days)}
                    </li>
                  ))}
                  {t.items.length > 4 && <li>+{t.items.length - 4} görev daha</li>}
                </ul>

                {confirmDeleteId === t.id && (
                  <div className="bg-destructive/10 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
                    <span>Bu şablon silinsin mi?</span>
                    <span className="flex gap-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                        Vazgeç
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>
                        Sil
                      </Button>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <TemplateEditorDialog template={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}
    </>
  );
}
