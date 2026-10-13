import { Check, Minus, X } from "lucide-react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { StickyXScroll } from "@/components/ui/sticky-x-scroll";
import { cn } from "@/lib/utils";
import { formatPeriod, monthLabel } from "@/lib/karne-periods";
import { attendanceNote, rsvpLabel, sessionStatusLabel, type ParentEventAttendance } from "@/lib/event-attendance";
import {
  deltaOf,
  formatStudyTime,
  studyTimeSentence,
  type KarneBranchAverage,
  type KarneCourseQuestions,
  type KarneExamGroup,
  type KarneSummary,
  type KarneTrendWeek,
} from "@/lib/karne-summary";

// The unified Karne: ONE standalone A4 document (1-2 pages), the same for student, parent and coach. Pure markup (no state, no
// hooks), so it renders on the server and prints exactly as it looks. Everything it shows comes from one KarneSummary
// (lib/karne-summary.ts); the only other inputs are the person's name, the single coach note and where the numbers came from.
//
// Print: A4 portrait (see globals.css .karne-doc). Page 1 = header, the showcase tiles, the study time, the momentum chart and the
// coach's note; page 2 = the exam overview and the event attendance -- and when the period has neither, the document is one page.
// Nothing relies on colour alone: every change carries ▲ / ▼ / = and a number, and the current period's line is thick as well as dark.

// The document is capped so it can never run past two A4 pages, whatever the period holds: the longest lists are cut to what fits and
// say how many more there were. (Everything is still in the data; this is only what the page shows.)
export const MAX_COURSE_ROWS = 7;
export const MAX_EXAMS_PER_GROUP = 4;
export const MAX_EVENTS = 4;

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const fmt = (n: number) => nf.format(n);

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ▲ +9 · ▼ −4 · = 0, with "geçen döneme göre" implied by the caption under it.
function Delta({ delta, unit = "", format }: { delta: number | null; unit?: string; format?: (n: number) => string }) {
  if (delta === null) return <span className="text-muted-foreground text-xs">Önceki dönem verisi yok</span>;
  const show = (n: number) => (format ? format(n) : fmt(n));
  if (delta === 0) return <span className="text-muted-foreground text-xs font-medium">= Değişmedi</span>;
  return (
    <span className={cn("text-xs font-semibold", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
      {delta > 0 ? "▲ +" : "▼ −"}
      {show(Math.abs(delta))}
      {unit} <span className="text-muted-foreground font-normal">geçen döneme göre</span>
    </span>
  );
}

function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-border bg-card flex flex-col gap-1 rounded-lg border p-3 print:gap-0.5 print:p-2 print:break-inside-avoid", className)}>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{label}</p>
      {children}
    </div>
  );
}

// ---- weekly momentum chart --------------------------------------------------------------------------------------------------------

const W = 640;
const H = 170;
const PAD = { left: 38, right: 14, top: 14, bottom: 26 };

export function KarneTrendChart({ weeks }: { weeks: KarneTrendWeek[] }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (weeks.length === 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW);
  const y = (pct: number) => PAD.top + innerH * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const points = weeks.map((w, i) => ({ ...w, i, px: x(i), py: w.pct === null ? null : y(w.pct) }));
  const hasData = points.some((p) => p.pct !== null);
  const lastInPeriod = [...points].reverse().find((p) => p.inPeriod && p.pct !== null);

  // One label per month: the first week that starts a new month.
  const monthTicks: { px: number; label: string }[] = [];
  let lastMonth = "";
  for (const p of points) {
    const m = p.weekStart.slice(0, 7);
    if (m !== lastMonth) {
      monthTicks.push({ px: p.px, label: monthLabel(p.weekStart) });
      lastMonth = m;
    }
  }

  if (!hasData) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Bu dönem için görev verisi yok.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Haftalık program tamamlama yüzdesi" className="text-foreground h-auto w-full print:h-[150px]">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "3 4"} />
          <text x={PAD.left - 6} y={y(g) + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
            %{g}
          </text>
        </g>
      ))}

      {/* earlier weeks: thin and grey; the report's own period: thick and dark */}
      {points.slice(1).map((p, k) => {
        const prev = points[k];
        if (p.py === null || prev.py === null) return null;
        return (
          <line
            key={p.weekStart}
            x1={prev.px}
            y1={prev.py}
            x2={p.px}
            y2={p.py}
            strokeLinecap="round"
            strokeWidth={p.inPeriod ? 3.5 : 1.5}
            className={p.inPeriod ? "stroke-foreground" : "stroke-muted-foreground/60"}
          />
        );
      })}
      {points.map((p) =>
        p.py === null ? null : <circle key={p.weekStart} cx={p.px} cy={p.py} r={p.inPeriod ? 4 : 2.5} className={p.inPeriod ? "fill-foreground" : "fill-muted-foreground/60"} />,
      )}

      {lastInPeriod && lastInPeriod.py !== null && (
        <text x={lastInPeriod.px} y={Math.max(PAD.top + 8, lastInPeriod.py - 9)} textAnchor="middle" fontSize={12} fontWeight={700} className="fill-foreground">
          %{lastInPeriod.pct}
        </text>
      )}

      {monthTicks.map((t) => (
        <text key={`${t.px}-${t.label}`} x={t.px} y={H - 8} textAnchor="start" fontSize={10} className="fill-muted-foreground">
          {t.label}
        </text>
      ))}
    </svg>
  );
}

// ---- exam overview -------------------------------------------------------------------------------------------------------------------

function BranchBars({ branches }: { branches: KarneBranchAverage[] }) {
  if (branches.length === 0) return null;
  return (
    <ul className="space-y-1.5 print:space-y-1" aria-label="Ana branş ortalamaları">
      {branches.map((b) => {
        const pct = b.questions > 0 ? Math.max(0, Math.min(100, (b.averageNet / b.questions) * 100)) : 0;
        return (
          <li key={b.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
            <span className="text-foreground truncate">{b.label}</span>
            <span className="bg-muted h-2.5 overflow-hidden rounded-full" aria-hidden="true">
              <span className="bg-foreground/80 block h-full rounded-full" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-foreground font-semibold tabular-nums">
              {fmt(b.averageNet)} <span className="text-muted-foreground font-normal">/ {b.questions}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ExamGroup({ group }: { group: KarneExamGroup }) {
  const change = deltaOf(group.averageNet, group.previousAverageNet);
  return (
    <section className="border-border bg-card space-y-3 rounded-lg border p-4 print:space-y-2 print:p-3 print:break-inside-avoid" aria-label={group.label}>
      <h4 className="text-foreground text-sm font-semibold">{group.label}</h4>
      <StickyXScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-[11px] tracking-wide uppercase">
              <th className="py-1 pr-3 font-semibold">Tarih</th>
              <th className="py-1 pr-3 font-semibold">Deneme</th>
              <th className="py-1 pr-3 text-right font-semibold">Net</th>
              <th className="py-1 text-right font-semibold">Önceki denemeye göre</th>
            </tr>
          </thead>
          <tbody>
            {group.items.slice(-MAX_EXAMS_PER_GROUP).map((item) => (
              <tr key={`${item.date}-${item.title}`} className="border-border border-b last:border-0">
                <td className="text-muted-foreground py-1.5 pr-3 whitespace-nowrap print:py-0.5">{formatDay(item.date)}</td>
                <td className="text-foreground py-1.5 pr-3 print:py-0.5">{item.title}</td>
                <td className="text-foreground py-1.5 pr-3 text-right font-semibold tabular-nums print:py-0.5">{fmt(item.net)}</td>
                <td className="py-1.5 text-right tabular-nums print:py-0.5">
                  {item.deltaVsPrevious === null ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : item.deltaVsPrevious === 0 ? (
                    <span className="text-muted-foreground text-xs">= 0</span>
                  ) : (
                    <span className={cn("text-xs font-semibold", item.deltaVsPrevious > 0 ? "text-emerald-700" : "text-rose-700")}>
                      {item.deltaVsPrevious > 0 ? "▲ +" : "▼ −"}
                      {fmt(Math.abs(item.deltaVsPrevious))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StickyXScroll>
      {group.items.length > MAX_EXAMS_PER_GROUP && (
        <p className="text-muted-foreground text-[11px]">Son {MAX_EXAMS_PER_GROUP} deneme gösteriliyor; ortalama ve en yüksek net {group.items.length} denemenin tamamından hesaplandı.</p>
      )}
      <p className="text-foreground text-xs">
        Dönem ortalaması: <strong>{fmt(group.averageNet)}</strong> net · En yüksek: <strong>{fmt(group.bestNet)}</strong>
        {group.previousAverageNet !== null && (
          <>
            {" "}
            · Önceki dönem ortalaması: {fmt(group.previousAverageNet)}
            {change !== null && change !== 0 && <> ({change > 0 ? "▲ +" : "▼ −"}{fmt(Math.abs(change))})</>}
          </>
        )}
      </p>
      <BranchBars branches={group.branches} />
    </section>
  );
}

// ---- course-level question breakdown --------------------------------------------------------------------------------------------------

// Largest courses first, the rest folded into one "Diğer dersler" row so the table stays short and still adds up to the total.
export function capCourseRows(rows: KarneCourseQuestions[], max: number = MAX_COURSE_ROWS): KarneCourseQuestions[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const rest = rows.slice(max - 1);
  const folded = rest.reduce(
    (acc, r) => ({ ...acc, total: acc.total + r.total, correct: acc.correct + r.correct, wrong: acc.wrong + r.wrong, empty: acc.empty + r.empty }),
    { key: "diger-dersler", label: `Diğer dersler (${rest.length})`, total: 0, correct: 0, wrong: 0, empty: 0 } as KarneCourseQuestions,
  );
  return [...head, folded];
}

function CourseQuestions({ rows }: { rows: KarneCourseQuestions[] }) {
  if (rows.length === 0) return null;
  const shown = capCourseRows(rows);
  return (
    <section className="border-border bg-card rounded-lg border p-3 print:p-2 print:break-inside-avoid" aria-label="Ders bazında çözülen soru">
      <h3 className="text-foreground mb-1.5 text-sm font-semibold">Ders bazında çözülen soru</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-[11px] tracking-wide uppercase">
            <th className="py-1 pr-2 text-left font-semibold">Ders</th>
            <th className="px-2 py-1 text-right font-semibold">Toplam</th>
            <th className="px-2 py-1 text-right font-semibold" aria-label="Doğru">✓</th>
            <th className="px-2 py-1 text-right font-semibold" aria-label="Yanlış">✗</th>
            <th className="py-1 pl-2 text-right font-semibold" aria-label="Boş">○</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className="border-border border-b last:border-0">
              <td className="text-foreground py-1 pr-2 print:py-0.5">{r.label}</td>
              <td className="text-foreground px-2 py-1 text-right font-semibold tabular-nums print:py-0.5">{fmt(r.total)}</td>
              <td className="px-2 py-1 text-right font-semibold text-emerald-700 tabular-nums print:py-0.5">{fmt(r.correct)}</td>
              <td className="px-2 py-1 text-right font-semibold text-rose-700 tabular-nums print:py-0.5">{fmt(r.wrong)}</td>
              <td className="text-muted-foreground py-1 pl-2 text-right font-semibold tabular-nums print:py-0.5">{fmt(r.empty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- event attendance, compact ---------------------------------------------------------------------------------------------------------

function CompactEvents({ events }: { events: ParentEventAttendance[] }) {
  if (events.length === 0) return null;
  const shown = events.slice(0, MAX_EVENTS);
  const hidden = events.length - shown.length;
  return (
    <section className="space-y-2" aria-label="Etkinlik katılımı">
      <h3 className="text-foreground text-sm font-semibold print:break-after-avoid">Etkinlik Katılımı</h3>
      <ul className="space-y-2 print:space-y-1.5">
        {shown.map((event) => {
          const note = attendanceNote(event.summary);
          return (
            <li key={event.announcementId} className="border-border bg-card space-y-1.5 rounded-lg border p-3 print:space-y-1 print:p-2 print:break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-foreground text-sm font-semibold">
                  {event.title} <span className="text-muted-foreground font-normal">· Etkinlik Tarihi: {formatDay(event.date)}</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  Öğrencinin yanıtı: <span className="text-foreground font-medium">{rsvpLabel(event.rsvp)}</span>
                </p>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {event.summary.sessions.map((s) => (
                  <li key={s.sessionNumber} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        s.status === "attended"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700"
                          : s.status === "not_attended"
                            ? "border-rose-500 bg-rose-500/15 text-rose-700"
                            : "border-border text-muted-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {s.status === "attended" ? <Check className="size-2.5" /> : s.status === "not_attended" ? <X className="size-2.5" /> : <Minus className="size-2.5" />}
                    </span>
                    <span className="text-foreground">
                      {s.sessionNumber}. Oturum: <span className="font-medium">{sessionStatusLabel(s.status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {note && (
                <p className="bg-muted text-foreground rounded-md px-2.5 py-1.5 text-xs" data-slot="attendance-note">
                  {note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="text-muted-foreground text-xs">+ {hidden} etkinlik daha</p>}
    </section>
  );
}

// ---- the document ------------------------------------------------------------------------------------------------------------------

export type KarneDocumentProps = {
  summary: KarneSummary;
  studentName: string | null;
  // "11. Sınıf", "LGS" ... shown next to the name when known.
  classLabel?: string | null;
  // The ONE coach note (the report card's coach_notes), only for a period that was approved with one.
  coachNote?: string | null;
  // Set when this period is a coach-approved report card.
  approval?: { approvedAt: string | null; cycleNumber: number | null } | null;
  // The parent's view: the numbers are the snapshot taken at approval.
  frozen?: boolean;
};

export function KarneDocument({ summary, studentName, classLabel, coachNote, approval, frozen }: KarneDocumentProps) {
  const { completion, questions, studyTime, consistency, attendance, trend, exams } = summary;
  const hasPageTwo = exams.groups.length > 0 || attendance.events.length > 0;
  const studyDelta = deltaOf(studyTime.minutes, studyTime.previousMinutes);

  return (
    <article className="karne-doc bg-background text-foreground mx-auto w-full max-w-[210mm] space-y-4 print:max-w-none print:space-y-2" aria-label="Karne">
      {/* ---- page 1 ---- */}
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-3 print:break-inside-avoid">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-11" />
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Donat Koçluk · Karne</p>
            <h2 className="text-foreground text-xl leading-tight font-semibold">{studentName ?? "Öğrenci"}</h2>
            {classLabel && <p className="text-muted-foreground text-xs">{classLabel}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-foreground text-sm font-semibold">{formatPeriod(summary.period.start, summary.period.end)}</p>
          <p className="text-muted-foreground text-xs">{summary.period.days} gün</p>
          {approval && (
            <p className="mt-1 inline-block rounded-full border border-emerald-600/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              Koç onaylı{approval.cycleNumber ? ` · ${approval.cycleNumber}. dönem` : ""}
            </p>
          )}
        </div>
      </header>

      <section aria-label="Özet" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          <Tile label="Program tamamlama">
            <p className="text-foreground text-3xl leading-none font-bold tabular-nums print:text-2xl">{completion.pct === null ? "—" : `%${completion.pct}`}</p>
            <Delta delta={deltaOf(completion.pct, completion.previousPct)} />
            {completion.previousPct !== null && <p className="text-muted-foreground text-[11px]">Önceki dönem: %{completion.previousPct}</p>}
          </Tile>

          <Tile label="Çözülen soru">
            <p className="text-foreground text-3xl leading-none font-bold tabular-nums print:text-2xl">{fmt(questions.total)}</p>
            <p className="text-xs tabular-nums">
              <span className="font-semibold text-emerald-700">✓ {fmt(questions.correct)}</span>{" "}
              <span className="font-semibold text-rose-700">✗ {fmt(questions.wrong)}</span>{" "}
              <span className="text-muted-foreground font-semibold">○ {fmt(questions.empty)}</span>
            </p>
            <Delta delta={questions.previousTotal > 0 || questions.total > 0 ? questions.total - questions.previousTotal : null} />
          </Tile>

          <Tile label="Etkinlik katılımı">
            {attendance.recordedSessions > 0 ? (
              <>
                <p className="text-foreground text-3xl leading-none font-bold tabular-nums print:text-2xl">
                  {attendance.attendedSessions} <span className="text-muted-foreground text-lg font-semibold">/ {attendance.recordedSessions}</span>
                </p>
                <p className="text-foreground text-xs font-semibold">oturuma katıldı{attendance.ratePct !== null ? ` · %${attendance.ratePct}` : ""}</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-3xl leading-none font-bold">—</p>
                <p className="text-muted-foreground text-xs">Bu dönemde yoklaması alınan etkinlik yok</p>
              </>
            )}
          </Tile>

          <Tile label="Tutarlılık">
            <p className="text-foreground text-3xl leading-none font-bold tabular-nums print:text-2xl">
              {consistency.activeDays} <span className="text-muted-foreground text-lg font-semibold">/ {consistency.totalDays}</span>
            </p>
            <p className="text-foreground text-xs font-semibold">gün çalıştı</p>
            <Delta delta={consistency.totalDays > 0 ? consistency.activeDays - consistency.previousActiveDays : null} unit=" gün" />
          </Tile>
        </div>

        {/* study time: its own prominent block, stated explicitly as tracked (kronometre) time */}
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 p-4 print:p-3 print:break-inside-avoid">
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Toplam çalışma süresi · kronometre</p>
            <p className="text-foreground text-4xl leading-tight font-bold tabular-nums print:text-3xl">{formatStudyTime(studyTime.minutes)}</p>
            <p className="text-foreground text-sm">{studyTimeSentence(studyTime.minutes)}</p>
            <p className="text-muted-foreground text-[11px]">Sitede görevlerde kronometre ile tutulan süredir; hedeflenen süre değildir.</p>
          </div>
          <div className="text-right">
            <Delta delta={studyDelta} format={(n) => formatStudyTime(n)} />
            {studyTime.previousMinutes > 0 && <p className="text-muted-foreground text-[11px]">Önceki dönem: {formatStudyTime(studyTime.previousMinutes)}</p>}
          </div>
        </div>
      </section>

      <CourseQuestions rows={questions.byCourse} />

      <section className="border-border bg-card space-y-2 rounded-lg border p-4 print:space-y-1 print:p-3 print:break-inside-avoid" aria-label="İvme">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-foreground text-sm font-semibold">İvme — haftalık program tamamlama</h3>
          <p className="text-muted-foreground text-[11px]">
            <span className="bg-foreground mr-1 inline-block h-1 w-5 rounded align-middle" /> bu dönem
            <span className="bg-muted-foreground/60 mr-1 ml-3 inline-block h-0.5 w-5 rounded align-middle" /> önceki haftalar
          </p>
        </div>
        <KarneTrendChart weeks={trend.weeks} />
      </section>

      {coachNote && (
        <section className="border-border bg-card space-y-1 rounded-lg border p-4 print:p-3 print:break-inside-avoid" aria-label="Koçun notu">
          <h3 className="text-foreground text-sm font-semibold">Koçun Notu</h3>
          <p className="text-foreground text-sm whitespace-pre-wrap print:text-xs print:leading-snug">{coachNote}</p>
        </section>
      )}

      {/* ---- page 2 (only when the period has exams or events) ---- */}
      {hasPageTwo && (
        <div className="space-y-4 print:space-y-3">
          {exams.groups.length > 0 && (
            <section className="space-y-3" aria-label="Deneme özeti">
              <h3 className="text-foreground text-sm font-semibold print:break-after-avoid">Deneme Özeti</h3>
              {exams.groups.map((g) => (
                <ExamGroup key={g.key} group={g} />
              ))}
            </section>
          )}
          <CompactEvents events={attendance.events} />
        </div>
      )}

      <footer className="text-muted-foreground border-border space-y-0.5 border-t pt-2 text-[11px] print:break-inside-avoid">
        <p>
          Veri notu: {formatPeriod(summary.period.start, summary.period.end)}. Önceki dönem, bu dönemle aynı uzunluktaki hemen önceki gün aralığıdır
          ({formatPeriod(summary.previousPeriod.start, summary.previousPeriod.end)}). Tamamlama yüzdesi görevlerin emek ağırlığına göre
          hesaplanır. Yoklaması alınmayan oturumlar katılım oranına dahil edilmez.
        </p>
        <p>
          {frozen ? "Bu karne, koçun onayladığı tarihteki verileri gösterir." : "Veriler güncel kayıtlardan hesaplanmıştır."}
          {approval?.approvedAt && <> Onay tarihi: {formatDay(approval.approvedAt.slice(0, 10))}.</>}
        </p>
      </footer>
    </article>
  );
}
