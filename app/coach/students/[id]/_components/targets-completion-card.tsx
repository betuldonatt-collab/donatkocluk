"use client";

import Link from "next/link";
import { CalendarPlus, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PROFILE_TERMS, formatPercentile } from "@/lib/profile-terms";
import type { CompletionStats, StudentProfile, SubjectCompletion } from "../types";

function CompletionBar({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-semibold tabular-nums">{pct === null ? "—" : `%${pct}`}</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === null ? "w-0" : pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function TargetsCompletionCard({
  studentId,
  profile,
  completion,
  subjectCompletion,
}: {
  studentId: string;
  profile: StudentProfile;
  completion: CompletionStats;
  subjectCompletion: SubjectCompletion[];
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
          <p className="text-muted-foreground -mt-2 text-xs">Bu haftanın başından bugüne kadar olan görevler; sonraki günler sayılmaz.</p>
          <CompletionBar label="Genel" pct={completion.overall} />
          {/* TYT/AYT split is a YKS notion; for LGS these would be two
              permanently empty bars. */}
          {profile.exam_type !== "LGS" && (
            <>
              <CompletionBar label="TYT" pct={completion.tyt} />
              <CompletionBar label="AYT" pct={completion.ayt} />
            </>
          )}
        </section>

        {subjectCompletion.length > 0 && (
          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ders Bazında Tamamlama</p>
            {subjectCompletion.map((s) => (
              <CompletionBar key={s.courseId} label={s.courseName} pct={s.pct} />
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
