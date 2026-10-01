"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { pastelGreenForProgress } from "@/lib/progress-colors";
import type { Maarif11Subject, Maarif11SubjectStat } from "@/lib/maarif-11-data";

// Same card/progress-bar language as the LGS vocab quiz dashboard
// (app/student/ingilizce-quiz/vocab-quiz-dashboard.tsx) -- large spacious
// cards in a 2-column grid, a tall pastel-green bar that levels up with
// completion, a completed card tinted in its own deepest shade. The one
// structural difference: there's no quiz/session to start yet, so the
// card's own action expands an inline list of this subject's units and
// sub-topics in place, rather than opening a separate full-screen flow.
function SubjectCard({ subject, stat }: { subject: Maarif11Subject; stat: Maarif11SubjectStat }) {
  const [expanded, setExpanded] = useState(false);
  const pct = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
  const complete = stat.total > 0 && stat.completed === stat.total;
  const fillColor = pastelGreenForProgress(pct);
  const hasUnits = subject.units.length > 0;

  return (
    <Card
      className={cn(complete && "border-transparent")}
      style={complete ? { borderColor: pastelGreenForProgress(pct, 0.6), backgroundColor: pastelGreenForProgress(pct, 0.08) } : undefined}
    >
      <CardHeader>
        <CardTitle className="text-xl leading-snug">{subject.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-sm">Tamamlanan</span>
            <span className="text-foreground text-lg font-semibold tabular-nums">
              {stat.completed}/{stat.total}
            </span>
          </div>
          <div
            className="bg-secondary h-4 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width,background-color] duration-300"
              style={{ width: `${pct}%`, backgroundColor: fillColor }}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-base"
          onClick={() => setExpanded((e) => !e)}
          disabled={!hasUnits}
        >
          {!hasUnits ? "Konu Yok" : expanded ? "Konuları Gizle" : "Konuları Gör"}
          {hasUnits && (expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />)}
        </Button>

        {expanded && hasUnits && (
          <div className="space-y-4 border-t pt-4">
            {subject.units.map((unit) => (
              <div key={unit.id} className="space-y-2">
                <p className="text-foreground text-sm font-medium">{unit.name}</p>
                <ul className="space-y-1.5 pl-1">
                  {unit.subTopics.map((topic) => (
                    <li key={topic.id} className="flex items-center gap-2 text-sm">
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", topic.completed ? "bg-primary" : "bg-muted-foreground/40")}
                      />
                      <span className={topic.completed ? "text-foreground" : "text-muted-foreground"}>{topic.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Maarif11Dashboard({
  subjects,
  subjectStats,
}: {
  subjects: Maarif11Subject[];
  subjectStats: Maarif11SubjectStat[];
}) {
  const statBySubjectId = new Map(subjectStats.map((s) => [s.subjectId, s]));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <GraduationCap className="text-primary size-8" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">11. Sınıf Türkiye Yüzyılı Maarif Modeli</h1>
          <p className="text-muted-foreground text-base">Bir ders seç ve konularını incele.</p>
        </div>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Müfredat henüz eklenmedi"
          description="11. sınıf ders ve konu listesi hazırlandığında burada görünecek."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              stat={statBySubjectId.get(subject.id) ?? { subjectId: subject.id, completed: 0, total: 0 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
