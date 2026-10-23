"use client";

import { useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { AlertTriangle, CalendarIcon, CheckCircle2, ChevronDown, ChevronUp, Clock, Plus, Trash2 } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { dateToISO, isoToDate, isValidISODateOnly } from "@/lib/chart-range";
import { CYCLE_DAYS, inclusiveDaySpan } from "@/lib/karne";
import { KarneLiveSection } from "./karne-live-section";
import { cn } from "@/lib/utils";
import { approveReportCard, deleteReportCard, generateCycleReportCard, type CoachReportCardRow } from "../../../actions";
import { LineChart } from "./charts/line-chart";

type KarneRange = { rangeStart: string; rangeEnd: string };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// approved_at is a full timestamptz (unlike the date-only range_start/range_end),
// so it must not get a second "T00:00:00" appended.
function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_LABELS: Record<CoachReportCardRow["status"], string> = { draft: "Taslak", approved: "Onaylandı" };
const STATUS_CLASSES: Record<CoachReportCardRow["status"], string> = {
  draft: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-700",
};

export function KarnelerTab({
  studentId,
  cycles: initialCycles,
  studentName = null,
  today,
  defaultRange,
  allTimeTrackedMinutes,
}: {
  studentId: string;
  cycles: CoachReportCardRow[];
  // For the unified Karne preview at the top of the tab (omitted: the preview is not shown).
  studentName?: string | null;
  today?: string;
  defaultRange: KarneRange | null;
  // All-time sum of tracked_duration_seconds across every task this
  // student has ever had, regardless of cycle (not scoped to one karne period).
  allTimeTrackedMinutes: number;
}) {
  const [cycles, setCycles] = useState(initialCycles);
  const [range, setRange] = useState<KarneRange | null>(defaultRange);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasOpenDraft = cycles.some((c) => c.status === "draft");

  // Only approved cycles count toward the "official" trend -- a draft
  // hasn't been reviewed yet, same "only coach-vetted data" rule every
  // other Karne aggregate already follows. Oldest-first for a left-to-
  // right timeline (cycles itself stays newest-first, matching the list
  // below and handleGenerate's own prepend). Each track's own null cycles
  // (no exam of that type that period) are skipped independently rather
  // than coerced to 0, so a missing AYT period doesn't read as a crash to
  // zero on the chart.
  const approvedCyclesAsc = cycles.filter((c) => c.status === "approved").slice().reverse();
  const tytTrend = approvedCyclesAsc
    .filter((c) => c.stats.tyt.current !== null)
    .map((c) => ({ date: c.range_start, value: c.stats.tyt.current! }));
  const aytTrend = approvedCyclesAsc
    .filter((c) => c.stats.ayt.current !== null)
    .map((c) => ({ date: c.range_start, value: c.stats.ayt.current! }));
  // A cycle generated for an LGS student carries stats.lgs (see
  // generateCycleReportCard); a student is one cohort throughout, so any
  // such cycle means the LGS trend chart replaces the TYT/AYT pair.
  const isLgsCohort = cycles.some((c) => c.stats.lgs !== undefined);
  // An 11th grader's cards carry no AYT half: one "11. Sınıf" chart (its TYT-structured Genel Deneme net).
  const isMaarif11Cohort = cycles.some((c) => c.stats.maarifGrade === 11);
  const lgsTrend = approvedCyclesAsc
    .filter((c) => c.stats.lgs?.current != null)
    .map((c) => ({ date: c.range_start, value: c.stats.lgs!.current! }));

  async function handleGenerate() {
    if (!range) return;
    setGenerating(true);
    setError(null);
    try {
      const created = (await generateCycleReportCard(studentId, range)) as CoachReportCardRow;
      setCycles((prev) => [created, ...prev]);
      setExpandedId(created.id);
    } catch (e) {
      setError(friendlyError(e, "Karne oluşturulamadı."));
    } finally {
      setGenerating(false);
    }
  }

  function handleApproved(updated: CoachReportCardRow) {
    setCycles((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleDeleted(id: string) {
    setCycles((prev) => prev.filter((c) => c.id !== id));
    setExpandedId((prev) => (prev === id ? null : prev));
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Öğrenciye onayladıktan sonra görünen karneler -- her dönem için tarih aralığını sen belirlersin.
      </p>

      {today && <KarneLiveSection studentId={studentId} studentName={studentName} today={today} cycles={cycles} />}

      {/* Cross-cycle progress -- combines "how is the exam net changing"
          (from every approved cycle's already-fetched stats, no extra
          query) with "how much time has actually been invested overall"
          (allTimeTrackedMinutes, across every cycle) -- deliberately placed together per product
          decision, since time invested is the context for reading the
          net trend next to it. */}
      {approvedCyclesAsc.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="border-border bg-card rounded-lg border p-4 lg:col-span-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Tüm Zamanlar Toplam Süre</p>
            <p className="text-foreground mt-2 text-2xl font-bold">{formatDuration(allTimeTrackedMinutes)}</p>
            <p className="text-muted-foreground mt-1 text-xs">Bu sistemde bugüne kadar tutulan toplam süre</p>
          </div>
          {isMaarif11Cohort ? (
            <div className="border-border bg-card rounded-lg border p-4 lg:col-span-2">
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">11. Sınıf Net Gelişimi</p>
              <LineChart data={tytTrend} />
            </div>
          ) : isLgsCohort ? (
            <div className="border-border bg-card rounded-lg border p-4 lg:col-span-2">
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{cycles.some((c) => c.stats.maarifGrade === 7) ? "7. Sınıf" : "LGS"} Net Gelişimi</p>
              <LineChart data={lgsTrend} />
            </div>
          ) : (
            <>
              <div className="border-border bg-card rounded-lg border p-4">
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">TYT Net Gelişimi</p>
                <LineChart data={tytTrend} />
              </div>
              <div className="border-border bg-card rounded-lg border p-4">
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">AYT Net Gelişimi</p>
                <LineChart data={aytTrend} color="#f59e0b" />
              </div>
            </>
          )}
        </div>
      )}

      {hasOpenDraft ? (
        <p className="text-muted-foreground text-xs">
          Yeni bir dönem oluşturmadan önce bekleyen taslağı onayla ya da gözden geçir.
        </p>
      ) : (
        <div className="border-border bg-muted/20 space-y-2 rounded-lg border p-3">
          <label className="text-foreground text-sm font-medium">
            Hangi takvim aralığının karnesini öğrenciye vermek istersiniz?
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <KarneRangePicker value={range} onChange={setRange} />
            <Button type="button" size="sm" onClick={handleGenerate} disabled={generating || !range}>
              <Plus className="size-4" />
              {generating ? "Oluşturuluyor..." : "Yeni Dönem Karnesi Oluştur"}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {cycles.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz karne oluşturulmadı.</p>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const isExpanded = expandedId === cycle.id;
            return (
              <div key={cycle.id} className="border-border rounded-lg border">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : cycle.id)}
                  className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-foreground text-sm font-semibold">{cycle.cycle_number}. Dönem</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(cycle.range_start)} – {formatDate(cycle.range_end)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_CLASSES[cycle.status])}>
                      {STATUS_LABELS[cycle.status]}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="text-muted-foreground size-4" /> : <ChevronDown className="text-muted-foreground size-4" />}
                </button>

                {isExpanded && (
                  <div className="border-border border-t p-4">
                    <ReportCardReview cycle={cycle} onApproved={handleApproved} onDeleted={handleDeleted} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Controlled range picker for a new Karne cycle's dates (Flexible 28-Day
// Warning Mode) -- same Popover+Calendar(mode="range") shape as the
// Grafikler tabs' own ChartRangePicker, but committing raw range_start/
// range_end ISO strings straight to the parent's state instead of a
// ChartRange union, since generateCycleReportCard takes exactly that
// shape and there's no "last N days" preset needed here.
//
// Deliberately does NOT auto-commit+close the instant a complete range
// is selected (the way ChartRangePicker does) -- react-day-picker's range
// mode treats every click after an already-complete selection as the
// start of a brand-new range, so with a default value pre-filled (this
// picker always opens with one, from defaultKarneRange/the last picked
// value) the very first click already lands on a "complete" 1-day range
// and the popover would close before the coach can pick an end date at
// all. An explicit "Uygula" step fixes that regardless of how many
// clicks the in-progress selection took.
function KarneRangePicker({ value, onChange }: { value: KarneRange | null; onChange: (range: KarneRange) => void }) {
  const [open, setOpen] = useState(false);
  const toDateRange = (v: KarneRange | null): DateRange | undefined =>
    v ? { from: isoToDate(v.rangeStart), to: isoToDate(v.rangeEnd) } : undefined;
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(toDateRange(value));

  function handleOpenChange(next: boolean) {
    if (next) setPendingRange(toDateRange(value));
    setOpen(next);
  }

  function handleApply() {
    if (!pendingRange?.from || !pendingRange.to) return;
    const rangeStart = dateToISO(pendingRange.from);
    const rangeEnd = dateToISO(pendingRange.to);
    // Defense in depth: dateToISO reads the Calendar's own Date object
    // back via local (not UTC) components specifically so the string
    // always matches the exact day the coach clicked, regardless of
    // timezone -- this just confirms that held before the range ever
    // reaches generateCycleReportCard, rather than trusting it silently.
    if (!isValidISODateOnly(rangeStart) || !isValidISODateOnly(rangeEnd)) return;
    onChange({ rangeStart, rangeEnd });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <CalendarIcon className="size-4" />
          {value ? `${formatDate(value.rangeStart)} – ${formatDate(value.rangeEnd)}` : "Tarih aralığı seç"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-2">
          <Calendar mode="range" selected={pendingRange} onSelect={setPendingRange} defaultMonth={pendingRange?.from} />
          <Button type="button" size="sm" className="w-full" onClick={handleApply} disabled={!pendingRange?.from || !pendingRange.to}>
            Uygula
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} dakika`;
  if (minutes === 0) return `${hours} saat`;
  return `${hours} saat ${minutes} dakika`;
}

// The expanded report card in the coach's list is only what the coach DOES with it: write the note, approve (and send) it, or delete it.
// What the Karne says -- the numbers, exams, attendance -- is the document above the list (KarneLiveSection), the very one the student
// and the parent receive; it is not repeated here.
export function ReportCardReview({
  cycle,
  onApproved,
  onDeleted,
}: {
  cycle: CoachReportCardRow;
  onApproved: (updated: CoachReportCardRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [note, setNote] = useState(cycle.coach_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Warning Mode (product decision): a cycle shorter than CYCLE_DAYS used
  // to hard-block approval. Short cycles are now legitimate (intensive
  // camps, short holidays) -- this only drives a yellow warning below,
  // approveReportCard (app/coach/actions.ts) no longer rejects it either.
  const daySpan = inclusiveDaySpan(cycle.range_start, cycle.range_end);
  const isShortCycle = daySpan < CYCLE_DAYS;

  async function handleApprove() {
    setSaving(true);
    setError(null);
    try {
      const updated = (await approveReportCard(cycle.id, note)) as CoachReportCardRow;
      onApproved(updated);
    } catch (e) {
      setError(friendlyError(e, "Onaylanamadı, tekrar dene."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteReportCard(cycle.id);
      setDeleteConfirmOpen(false);
      onDeleted(cycle.id);
    } catch (e) {
      setDeleteError(friendlyError(e, "Silinemedi, tekrar dene."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`note-${cycle.id}`} className="text-foreground text-sm font-semibold">
          Öğrenciye Not
        </label>
        <Textarea
          id={`note-${cycle.id}`}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bu dönem için kişisel bir değerlendirme yaz..."
          disabled={cycle.status === "approved"}
        />
        {cycle.status === "draft" && (
          <p className="text-muted-foreground text-xs">Onayladığında öğrenci ve veli bu dönemin karnesini notunla birlikte görür.</p>
        )}
      </div>

      {isShortCycle && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Dikkat: Bu dönem {CYCLE_DAYS} günden kısa ({daySpan} gün). Özel bir kamp dönemi değilse karnelerin {CYCLE_DAYS} günlük
            olması önerilir.
          </p>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {cycle.status === "draft" ? (
          <Button type="button" onClick={handleApprove} disabled={saving}>
            <CheckCircle2 className="size-4" />
            {saving ? "Gönderiliyor..." : "Onayla ve Gönder"}
          </Button>
        ) : (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="size-3" />
            {cycle.approved_at ? `${formatTimestamp(cycle.approved_at)} tarihinde onaylandı` : "Onaylandı"}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteConfirmOpen(true)}
        >
          <Trash2 className="size-3.5" />
          Karneyi Sil
        </Button>
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => !deleting && setDeleteConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Karneyi Sil</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {cycle.status === "approved"
              ? "Bu karne öğrenciye onaylanmış ve gösterilmiş olabilir. Silindiğinde öğrencinin görünümünden de kalkar. Bu işlem geri alınamaz."
              : "Bu taslak karne kalıcı olarak silinecek. Bu işlem geri alınamaz."}
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
              İptal
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Siliniyor..." : "Kalıcı Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
