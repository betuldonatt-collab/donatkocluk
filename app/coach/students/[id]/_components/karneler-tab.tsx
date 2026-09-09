"use client";

import { useState } from "react";
import { AlertTriangle, CalendarIcon, CheckCircle2, ChevronDown, ChevronUp, Clock, Plus, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { dateToISO, isoToDate, isValidISODateOnly } from "@/lib/chart-range";
import {
  AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK,
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_BRANCH_EXAM_MACRO_COURSES,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { HEAT_TIER_STYLES, heatTier } from "@/lib/gelisim-haritasi";
import { CYCLE_DAYS, inclusiveDaySpan, type KarneSubjectScoreRow, type KarneTopicRow, type NetSummary } from "@/lib/karne";
import { cn } from "@/lib/utils";
import { approveReportCard, deleteReportCard, generateCycleReportCard, type CoachReportCardRow } from "../../../actions";

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
  defaultRange,
}: {
  studentId: string;
  cycles: CoachReportCardRow[];
  defaultRange: KarneRange | null;
}) {
  const [cycles, setCycles] = useState(initialCycles);
  const [range, setRange] = useState<KarneRange | null>(defaultRange);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasOpenDraft = cycles.some((c) => c.status === "draft");

  async function handleGenerate() {
    if (!range) return;
    setGenerating(true);
    setError(null);
    try {
      const created = (await generateCycleReportCard(studentId, range)) as CoachReportCardRow;
      setCycles((prev) => [created, ...prev]);
      setExpandedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Karne oluşturulamadı.");
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

// Every minute logged in the system this cycle (NetSummary.totalDurationMinutes,
// app/coach/actions.ts's generateCycleReportCard) -- across every task
// type, not just the 4 exam-shaped ones ScoreBreakdownCard covers. One
// instance per cycle (not per TYT/AYT card, unlike ScoreBreakdownCard),
// shown near the top of the cycle's own content since it's a single
// cycle-wide figure. Undefined (not 0) for a cycle generated before this
// field existed -- the caller only renders this when it's actually present.
function TotalDurationCard({ totalDurationMinutes }: { totalDurationMinutes: number }) {
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Toplam Çalışma Süresi</p>
      <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{formatDuration(totalDurationMinutes)}</p>
      <p className="text-muted-foreground mt-1 text-xs">Bu sistemde tutulan toplam süre</p>
    </div>
  );
}

function NetCard({ label, current, previous }: { label: string; current: number | null; previous: number | null }) {
  const delta = current !== null && previous !== null ? Math.round((current - previous) * 100) / 100 : null;
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{current !== null ? current : "—"}</p>
      {delta !== null ? (
        <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
          {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          Önceki döneme göre {delta >= 0 ? "+" : ""}
          {delta}
        </p>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">Önceki dönem verisi yok</p>
      )}
    </div>
  );
}

function ScorePill({ label, value, tone }: { label: string; value: number; tone: "total" | "correct" | "wrong" | "empty" }) {
  const toneClass =
    tone === "correct"
      ? "text-emerald-600"
      : tone === "wrong"
        ? "text-rose-600"
        : tone === "total"
          ? "text-foreground"
          : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("text-xl font-bold tabular-nums", toneClass)}>{value}</span>
      <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </div>
  );
}

// Replaces the old TYT-only Soru Çözüm Hızı (questions/hour) card with the
// cycle's actual Doğru/Yanlış/Boş totals -- a grand total row (now led by
// an explicit Toplam Soru pill, not just the D/Y/B split) plus a
// per-subject/course breakdown underneath, each row also stating its own
// Toplam Soru rather than leaving the reader to add D+Y+B up themselves.
// Shared by both the TYT card (one instance, from stats.scoreBreakdown)
// and each AYT track's own card (one instance per stats.aytScoreBreakdown
// entry) -- same design either way, only the title and the subject rows
// underneath differ. Kept pixel-identical across all three panels that
// render Karne (this file, the student's and the parent's own
// karne-detail-client.tsx) so a report card reads the same regardless of
// who's looking at it.
function ScoreBreakdownCard({
  title,
  total,
  bySubject,
}: {
  title: string;
  total: { correct: number; wrong: number; empty: number };
  bySubject: KarneSubjectScoreRow[];
}) {
  const grandTotal = total.correct + total.wrong + total.empty;
  const hasAnyData = grandTotal > 0;
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</p>
      <div className="mt-2 flex items-center gap-6">
        <ScorePill label="Toplam Soru" value={grandTotal} tone="total" />
        <ScorePill label="Doğru" value={total.correct} tone="correct" />
        <ScorePill label="Yanlış" value={total.wrong} tone="wrong" />
        <ScorePill label="Boş" value={total.empty} tone="empty" />
      </div>

      {hasAnyData ? (
        <div className="border-border/60 mt-3 space-y-1.5 border-t pt-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Ders Bazlı Kırılım</p>
          {bySubject.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground font-medium">{row.label}</span>
              <span className="tabular-nums">
                <span className="text-foreground font-semibold">Toplam {row.correct + row.wrong + row.empty}</span>
                {" · "}
                <span className="text-emerald-600">{row.correct} D</span>
                {" · "}
                <span className="text-rose-600">{row.wrong} Y</span>
                {" · "}
                <span className="text-muted-foreground">{row.empty} B</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">Bu dönemde kayıtlı sonuç yok</p>
      )}
    </div>
  );
}

function CourseChips({ courses, selectedId, onSelect }: { courses: Course[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            selectedId === c.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

function TopicGrid({ courseId, rows }: { courseId: string; rows: KarneTopicRow[] }) {
  const courseRows = rows.filter((r) => r.courseId === courseId).sort((a, b) => b.count - a.count);
  if (courseRows.length === 0 || courseRows[0].windowSize === 0) {
    return <p className="text-muted-foreground text-sm">Bu dönemde bu ders için deneme kaydı yok.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {courseRows.map((row) => {
        const tier = heatTier(row.count, row.windowSize);
        return (
          <div key={row.topicId} className={cn("space-y-1 rounded-lg border px-3 py-2", HEAT_TIER_STYLES[tier].tile)}>
            <p className="truncate text-sm font-medium">{row.topicName}</p>
            <p className="text-xs tabular-nums opacity-80">
              {row.count}/{row.windowSize}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ReportCardReview({
  cycle,
  onApproved,
  onDeleted,
}: {
  cycle: CoachReportCardRow;
  onApproved: (updated: CoachReportCardRow) => void;
  onDeleted: (id: string) => void;
}) {
  const stats = cycle.stats as NetSummary;
  const topicRows = cycle.topic_mistakes as KarneTopicRow[];
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);
  const [note, setNote] = useState(cycle.coach_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }
  // Macro ("whole fruit") branch-exam subjects sit alongside the atomic
  // ("sliced") ones here too, so a mistake logged under a combined "TYT
  // Fen" exam shows up in its own chip, independent of "Fizik"/"Kimya"/
  // "Biyoloji"'s own chips.
  const tytCourses = [...TYT_BRANCH_EXAM_MACRO_COURSES, ...TYT_COURSES];
  const aytCourses = [...AYT_BRANCH_EXAM_MACRO_COURSES_BY_TRACK[track], ...AYT_COURSES_BY_TRACK[track]];

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
      setError(e instanceof Error ? e.message : "Onaylanamadı, tekrar dene.");
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
      setDeleteError(e instanceof Error ? e.message : "Silinemedi, tekrar dene.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {stats.totalDurationMinutes !== undefined && <TotalDurationCard totalDurationMinutes={stats.totalDurationMinutes} />}

      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">TYT</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NetCard label="TYT Genel Deneme Ortalama Net" current={stats.tyt.current} previous={stats.tyt.previous} />
            {stats.scoreBreakdown && (
              <ScoreBreakdownCard
                title="Toplam Doğru / Yanlış / Boş"
                total={stats.scoreBreakdown.total}
                bySubject={stats.scoreBreakdown.bySubject}
              />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">AYT</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NetCard label="AYT Genel Deneme Ortalama Net" current={stats.ayt.current} previous={stats.ayt.previous} />
            {stats.aytScoreBreakdown?.map((trackBreakdown) => (
              <ScoreBreakdownCard
                key={trackBreakdown.track}
                title={`AYT ${trackBreakdown.trackLabel} — Toplam Doğru / Yanlış / Boş`}
                total={trackBreakdown.total}
                bySubject={trackBreakdown.bySubject}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-foreground text-sm font-semibold">Konu Bazlı Hata Sıklığı</h4>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {(["hot", "warm", "cool"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
              <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">TYT</p>
          <CourseChips courses={tytCourses} selectedId={tytCourseId} onSelect={setTytCourseId} />
          <TopicGrid courseId={tytCourseId} rows={topicRows} />
        </div>

        <div className="space-y-2">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTrackChange(t)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  track === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>
          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <TopicGrid courseId={aytCourseId} rows={topicRows} />
        </div>
      </div>

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
