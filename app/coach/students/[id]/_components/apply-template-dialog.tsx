"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { mondayOf } from "@/lib/date";
import { countTemplateTasks, defaultTemplateStart, describeDays, isMonday, summarizeTemplateTask } from "@/lib/weekly-template";
import {
  applyWeeklyTemplate,
  previewWeeklyTemplate,
  type WeeklyTemplate,
  type WeeklyTemplatePreview,
} from "../../../actions";

// "Şablon Uygula": pick one of the coach's templates for this student's cohort,
// pick the Monday the week starts on, and every task/routine of the template is
// added to that week. Shows what will happen (how many tasks, what the week
// already holds, an earlier application of the same template) before writing.

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function ApplyTemplateDialog({
  studentId,
  templates,
  today,
}: {
  studentId: string;
  // Already filtered to the student's cohort by the caller.
  templates: WeeklyTemplate[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(defaultTemplateStart(today));
  const [preview, setPreview] = useState<WeeklyTemplatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once the server says this template was already applied to this week and
  // the coach must confirm adding it again.
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [applying, startApplying] = useTransition();
  const previewRequest = useRef(0);

  const selected = templates.find((t) => t.id === templateId) ?? null;
  const mondayOk = isMonday(weekStart);

  // Preview is fetched from event handlers (not an effect); a counter drops
  // answers that were superseded by a newer pick while in flight.
  async function refreshPreview(nextTemplateId: string, nextWeekStart: string) {
    const request = ++previewRequest.current;
    setPreview(null);
    setError(null);
    setNeedsConfirm(false);
    if (!nextTemplateId || !isMonday(nextWeekStart)) return;
    const result = await previewWeeklyTemplate({ templateId: nextTemplateId, studentId, weekStart: nextWeekStart });
    if (request !== previewRequest.current) return;
    if (result.ok) setPreview(result.data);
    else setError(result.error);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const start = defaultTemplateStart(today);
      const id = templates.find((t) => t.id === templateId)?.id ?? templates[0]?.id ?? "";
      setTemplateId(id);
      setWeekStart(start);
      void refreshPreview(id, start);
    }
  }

  function changeTemplate(id: string) {
    setTemplateId(id);
    void refreshPreview(id, weekStart);
  }

  function changeWeekStart(value: string) {
    setWeekStart(value);
    void refreshPreview(templateId, value);
  }

  function apply(force: boolean) {
    setError(null);
    startApplying(async () => {
      const result = await applyWeeklyTemplate({ templateId, studentId, weekStart, force });
      if (result.ok) {
        toast.success(`${result.created} görev eklendi.`);
        setOpen(false);
        router.refresh();
        return;
      }
      if (result.needsConfirm) {
        setNeedsConfirm(true);
        setError(result.error);
        return;
      }
      setError(result.error);
    });
  }

  const blocked = !selected || !mondayOk || !preview || preview.locked;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <LayoutTemplate className="size-4" />
          Şablon Uygula
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Şablon Uygula</DialogTitle>
          <DialogDescription>Şablondaki tüm rutinler ve görevler seçtiğin haftaya tek seferde eklenir.</DialogDescription>
        </DialogHeader>

        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Bu öğrenci türü için henüz şablonun yok.{" "}
            <Link href="/coach/templates" className="text-primary underline underline-offset-2">
              Şablon oluştur
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Şablon</Label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => changeTemplate(t.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      templateId === t.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {selected && (
                <ul className="text-muted-foreground space-y-0.5 pt-1 text-xs">
                  {selected.items.map((item) => (
                    <li key={item.id}>
                      <span className="text-foreground">{summarizeTemplateTask(item.task)}</span> — {describeDays(item.days)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apply-template-start">Hafta başlangıcı (Pazartesi)</Label>
              <Input id="apply-template-start" type="date" value={weekStart} onChange={(e) => changeWeekStart(e.target.value)} />
              {!mondayOk && weekStart && (
                <p className="text-destructive text-xs">
                  Şablon bir Pazartesi&apos;den başlamalı.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={() => changeWeekStart(mondayOf(weekStart))}>
                    {formatDate(mondayOf(weekStart))} Pazartesi&apos;sini seç
                  </button>
                </p>
              )}
            </div>

            {selected && preview && mondayOk && (
              <div className="bg-muted space-y-1 rounded-md px-3 py-2 text-sm">
                <p className="text-foreground">
                  <span className="font-semibold">{preview.taskCount || countTemplateTasks(selected.items)} görev</span> eklenecek
                  ({formatDate(weekStart)} haftası).
                </p>
                {preview.existingTaskCount > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Bu hafta öğrencinin zaten {preview.existingTaskCount} görevi var; şablon bunların üzerine eklenir, hiçbiri silinmez.
                  </p>
                )}
                {preview.appliedBefore && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Bu şablon bu haftaya {formatDate(preview.appliedBefore.slice(0, 10))} tarihinde zaten uygulanmış.
                  </p>
                )}
                {preview.locked && (
                  <p className="text-destructive text-xs">Bu hafta kilitli olduğu için şablon uygulanamaz.</p>
                )}
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        {templates.length > 0 && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={applying}>
              İptal
            </Button>
            {needsConfirm || preview?.appliedBefore ? (
              <Button type="button" onClick={() => apply(true)} disabled={applying || blocked}>
                {applying ? "Ekleniyor..." : "Yine de Ekle"}
              </Button>
            ) : (
              <Button type="button" onClick={() => apply(false)} disabled={applying || blocked}>
                {applying ? "Ekleniyor..." : "Uygula"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
