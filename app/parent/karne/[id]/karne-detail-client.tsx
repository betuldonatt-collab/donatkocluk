"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AYT_COURSES_BY_TRACK, TRACK_LABELS, TYT_COURSES, type Course, type Track } from "@/lib/curriculum";
import { HEAT_TIER_STYLES, heatTier } from "@/lib/gelisim-haritasi";
import type { KarneSubjectScoreRow, KarneTopicRow, NetSummary } from "@/lib/karne";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// approved_at is a full timestamptz (unlike the date-only range_start/range_end),
// so it must not get a second "T00:00:00" appended.
function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} dakika`;
  if (minutes === 0) return `${hours} saat`;
  return `${hours} saat ${minutes} dakika`;
}

// Mirrors the student's own TotalDurationCard (deneme-analizleri/karne/
// [id]/karne-detail-client.tsx) exactly, which itself mirrors the coach
// panel's (karneler-tab.tsx). Every minute logged in the system this
// cycle (NetSummary.totalDurationMinutes) -- across every task type, not
// just the 4 exam-shaped ones ScoreBreakdownCard covers. Undefined (not
// 0) for a cycle generated before this field existed -- the caller only
// renders this when it's actually present.
function TotalDurationCard({ totalDurationMinutes }: { totalDurationMinutes: number }) {
  return (
    <div className="border-border bg-card rounded-lg border p-4 print:break-inside-avoid">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Toplam Çalışma Süresi</p>
      <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{formatDuration(totalDurationMinutes)}</p>
      <p className="text-muted-foreground mt-1 text-xs">Bu sistemde tutulan toplam süre</p>
    </div>
  );
}

function NetCard({ label, current, previous }: { label: string; current: number | null; previous: number | null }) {
  const delta = current !== null && previous !== null ? Math.round((current - previous) * 100) / 100 : null;
  return (
    <div className="border-border bg-card rounded-lg border p-4 print:break-inside-avoid">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-foreground mt-1 text-3xl font-bold tabular-nums">{current !== null ? current : "—"}</p>
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
      <span className={cn("text-2xl font-bold tabular-nums", toneClass)}>{value}</span>
      <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </div>
  );
}

// Mirrors the student's own ScoreBreakdownCard (deneme-analizleri/karne/
// [id]/karne-detail-client.tsx) exactly, which itself mirrors the coach
// panel's (karneler-tab.tsx) -- duplicated per this codebase's per-panel
// UI convention, all three deliberately kept pixel-identical so a Karne
// reads the same regardless of which role is looking at it. Leads with an
// explicit Toplam Soru pill (not just the D/Y/B split), and each
// per-subject row states its own Toplam Soru too.
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
    <div className="border-border bg-card rounded-lg border p-4 print:break-inside-avoid">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-6">
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
    <div className="flex flex-wrap gap-2 print:hidden">
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-muted-foreground hover:text-foreground",
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
          <div key={row.topicId} className={cn("space-y-1 rounded-lg border px-3 py-2 print:break-inside-avoid", HEAT_TIER_STYLES[tier].tile)}>
            <p className="truncate text-sm font-medium">{row.topicName}</p>
            <p className="text-xs tabular-nums opacity-80">
              {row.count}/{row.windowSize} bu dönemki deneme
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Read-only mirror of the student's own KarneDetailClient -- no coach
// controls (Onayla ve Gönder, date range picker, delete) are ported over,
// since a parent must never be able to edit/approve a report card, only
// view one that's already approved (RLS already enforces this server-side
// too; this component just has no mutation affordances to begin with).
export function KarneDetailClient({
  cycleNumber,
  rangeStart,
  rangeEnd,
  approvedAt,
  coachNotes,
  stats,
  topicRows,
}: {
  cycleNumber: number;
  rangeStart: string;
  rangeEnd: string;
  approvedAt: string | null;
  coachNotes: string | null;
  stats: NetSummary;
  topicRows: KarneTopicRow[];
}) {
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }
  const aytCourses = AYT_COURSES_BY_TRACK[track];

  return (
    <div className="space-y-6 print:space-y-4">
      <Link
        href="/parent/karne"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm print:hidden"
      >
        <ArrowLeft className="size-4" />
        Karneler
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground text-lg font-semibold">{cycleNumber}. Dönem Karnesi</h2>
          <p className="text-muted-foreground text-sm">
            {formatDate(rangeStart)} – {formatDate(rangeEnd)}
          </p>
          {approvedAt && <p className="text-muted-foreground text-xs">{formatTimestamp(approvedAt)} tarihinde onaylandı</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="h-10 print:hidden">
          <Printer className="size-4" />
          Yazdır / PDF Kaydet
        </Button>
      </div>

      {stats.totalDurationMinutes !== undefined && <TotalDurationCard totalDurationMinutes={stats.totalDurationMinutes} />}

      {coachNotes && (
        <section className="border-border bg-card space-y-2 rounded-lg border p-4 print:break-inside-avoid">
          <h3 className="text-foreground text-sm font-semibold">Koçtan Not</h3>
          <p className="text-foreground text-sm whitespace-pre-wrap">{coachNotes}</p>
        </section>
      )}

      <section className="space-y-4 print:break-inside-avoid">
        <h3 className="text-foreground text-sm font-semibold">Net Gelişimi</h3>
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
      </section>

      <section className="space-y-3">
        <h3 className="text-foreground text-sm font-semibold">Konu Bazlı Hata Sıklığı</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs print:hidden">
          {(["hot", "warm", "cool"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full border", HEAT_TIER_STYLES[t].tile)} />
              <span className="text-muted-foreground">{HEAT_TIER_STYLES[t].label}</span>
            </span>
          ))}
        </div>

        <Tabs defaultValue="tyt">
          <TabsList className="print:hidden">
            <TabsTrigger value="tyt">TYT</TabsTrigger>
            <TabsTrigger value="ayt">AYT</TabsTrigger>
          </TabsList>

          <TabsContent value="tyt" className="space-y-4 pt-4">
            <CourseChips courses={TYT_COURSES} selectedId={tytCourseId} onSelect={setTytCourseId} />
            <TopicGrid courseId={tytCourseId} rows={topicRows} />
          </TabsContent>

          <TabsContent value="ayt" className="space-y-4 pt-4">
            <div className="bg-secondary inline-flex rounded-lg p-1 print:hidden">
              {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTrackChange(t)}
                  className={cn(
                    "min-h-10 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
                    track === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {TRACK_LABELS[t]}
                </button>
              ))}
            </div>
            <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
            <TopicGrid courseId={aytCourseId} rows={topicRows} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
