"use client";

import Link from "next/link";
import { CalendarPlus, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PROFILE_TERMS, formatPercentile } from "@/lib/profile-terms";
import type { DualCompletionStats, StudentProfile, SubjectCompletion } from "../types";

function barColorClass(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/20";
  return pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
}

// Shows the current week's figure and the all-time one side by side (the
// coach's own requested "Haftalık: %80 | Genel: %65" format), each with its
// own thin bar underneath -- one label, two numbers, two bars, so a coach
// can tell at a glance whether a student caught up this week or has been
// steady all along without those two stories blending into one average.
function DualCompletionBar({ label, weekly, allTime }: { label: string; weekly: number | null; allTime: number | null }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground min-w-0 flex-1 truncate">{label}</span>
        <span className="text-foreground shrink-0 font-semibold tabular-nums">
          Haftalık {weekly === null ? "—" : `%${weekly}`} <span className="text-muted-foreground font-normal">·</span> Genel{" "}
          {allTime === null ? "—" : `%${allTime}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" title="Haftalık">
          <div className={cn("h-full rounded-full transition-all", barColorClass(weekly))} style={{ width: `${weekly ?? 0}%` }} />
        </div>
        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" title="Genel">
          <div className={cn("h-full rounded-full transition-all", barColorClass(allTime))} style={{ width: `${allTime ?? 0}%` }} />
        </div>
      </div>
    </div>
  );
}

export function TargetsCompletionCard({
  studentId,
  profile,
  completion,
  subjectCompletion,
  progressFrom,
  progressFromLock,
}: {
  studentId: string;
  profile: StudentProfile;
  completion: DualCompletionStats;
  subjectCompletion: SubjectCompletion[];
  // The first day the percentages count, and whether that is the day the week was
  // locked (otherwise the week's Monday).
  progressFrom: string;
  progressFromLock: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-base">Hedefler ve İlerleme</CardTitle>
        <Button type="button" size="sm" asChild>
          <Link href={`/coach/students/${studentId}/schedule`}>
            <CalendarPlus className="size-4" />
            Haftalık Görev Ata / Program Ekle
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Target className="size-3.5" />
            Hedefler
          </p>
          <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {profile.exam_type === "LGS" ? (
              <>
                <div>
                  <p className="text-muted-foreground text-xs">{PROFILE_TERMS.LGS.targetOne}</p>
                  <p className="text-foreground font-medium">{profile.target_high_school || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{PROFILE_TERMS.LGS.targetTwo}</p>
                  <p className="text-foreground font-medium">{formatPercentile(profile.target_percentile)}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-muted-foreground text-xs">Hedef Üniversite</p>
                  <p className="text-foreground font-medium">{profile.target_university || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Hedef Bölüm</p>
                  <p className="text-foreground font-medium">{profile.target_department || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Hedef Sıralama</p>
                  <p className="text-foreground font-medium">{profile.target_ranking || "—"}</p>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Program Tamamlama</p>
          <p className="text-muted-foreground -mt-2 text-xs">
            Haftalık:{" "}
            {new Date(`${progressFrom}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" })}
            {progressFromLock ? " (programın kilitlendiği gün)" : " (haftanın başı)"} ile bugün arası. Genel: bugüne kadar atanmış tüm
            görevler. İkisinde de sonraki günler sayılmaz.
          </p>
          {/* Row label "Toplam" (not "Genel") -- this row is TYT+AYT combined,
              and "Genel" is already what each row's own all-time COLUMN is
              called (vs. that same row's "Haftalık" column) -- reusing it
              here too would read as "Genel: Haftalık %80 · Genel %65". */}
          <DualCompletionBar label="Toplam" weekly={completion.weekly.overall} allTime={completion.allTime.overall} />
          {/* TYT/AYT split is a YKS notion; for LGS these would be two
              permanently empty bars. */}
          {profile.exam_type !== "LGS" && (
            <>
              <DualCompletionBar label="TYT" weekly={completion.weekly.tyt} allTime={completion.allTime.tyt} />
              <DualCompletionBar label="AYT" weekly={completion.weekly.ayt} allTime={completion.allTime.ayt} />
            </>
          )}
        </section>

        {subjectCompletion.length > 0 && (
          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ders Bazında Tamamlama</p>
            {subjectCompletion.map((s) => (
              <DualCompletionBar key={s.courseId} label={s.courseName} weekly={s.weekly.pct} allTime={s.allTime.pct} />
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
