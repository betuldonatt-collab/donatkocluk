"use client";

import { useState } from "react";
import { BookOpenCheck, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { applyCorrectToUnitStat, unitStarted, vocabUnitTitle, type UnitStat } from "@/lib/lgs-vocab";
import { masteryTierColor, pastelGreenForProgress } from "@/lib/progress-colors";
import { VocabQuizSession } from "./vocab-quiz-session";

function UnitCard({ stat, onStart }: { stat: UnitStat; onStart: () => void }) {
  // The counter is every word answered correctly at least once ("started"); the bar splits that into the three mastery tiers --
  // deepest (3 or more correct answers) first, then medium (2), then light (1) -- so progress shows from the very first
  // correct answer and visibly deepens as words are practiced.
  const started = unitStarted(stat);
  const pct = stat.total > 0 ? Math.round((started / stat.total) * 100) : 0;
  const share = (n: number) => (stat.total > 0 ? (n / stat.total) * 100 : 0);
  const complete = stat.total > 0 && stat.mastered === stat.total;
  // The completed card's own accent reuses the deepest tier as a tint, so it reads as the natural top of the same scale.
  const fillColor = pastelGreenForProgress(100);
  return (
    <Card
      className={cn(complete && "border-transparent")}
      style={complete ? { borderColor: pastelGreenForProgress(pct, 0.6), backgroundColor: pastelGreenForProgress(pct, 0.08) } : undefined}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-xl leading-snug">{vocabUnitTitle(stat.unitNumber)}</CardTitle>
        {complete && <Trophy className="mt-0.5 size-7 shrink-0" style={{ color: fillColor }} />}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-sm">İlerleme</span>
            <span className="text-foreground text-lg font-semibold tabular-nums" title="En az bir kez doğru bilinen kelime sayısı">
              {started}/{stat.total}
            </span>
          </div>
          <div
            className="bg-secondary flex h-4 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${stat.mastered} kelime pekişti, ${stat.level2} kelime 2 kez, ${stat.level1} kelime 1 kez doğru bilindi`}
          >
            <div className="h-full transition-[width] duration-300" style={{ width: `${share(stat.mastered)}%`, backgroundColor: masteryTierColor(3) }} />
            <div className="h-full transition-[width] duration-300" style={{ width: `${share(stat.level2)}%`, backgroundColor: masteryTierColor(2) }} />
            <div className="h-full transition-[width] duration-300" style={{ width: `${share(stat.level1)}%`, backgroundColor: masteryTierColor(1) }} />
          </div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            {([
              [1, "1 doğru"],
              [2, "2 doğru"],
              [3, "3+ doğru"],
            ] as const).map(([level, label]) => (
              <span key={level} className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: masteryTierColor(level) }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <Button type="button" size="lg" className="w-full text-base" onClick={onStart} disabled={stat.total === 0}>
          {stat.total === 0 ? "Kelime Yok" : "Quize Başla"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Dashboard <-> active quiz session, all in one page (no route change) so
// "Çalışmaya Devam Et" (VocabQuizSession's own continue button) can fetch
// the next batch instantly instead of a full navigation.
export function VocabQuizDashboard({ initialUnitStats }: { initialUnitStats: UnitStat[] }) {
  const [unitStats, setUnitStats] = useState(initialUnitStats);
  const [activeUnit, setActiveUnit] = useState<number | null>(null);

  // Called after every correct answer during a session, so the dashboard's own counters (words started, the three tiers) are
  // correct the moment the student exits back to it -- without needing a full server round-trip/page reload.
  function handleWordCorrect(unitNumber: number, previousCount: number, nextCount: number) {
    setUnitStats((prev) => prev.map((s) => (s.unitNumber === unitNumber ? applyCorrectToUnitStat(s, previousCount, nextCount) : s)));
  }

  if (activeUnit !== null) {
    return (
      <VocabQuizSession
        unitNumber={activeUnit}
        onExit={() => setActiveUnit(null)}
        onWordCorrect={(previousCount, nextCount) => handleWordCorrect(activeUnit, previousCount, nextCount)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BookOpenCheck className="text-primary size-8" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">İngilizce Kelime Quizi</h1>
          <p className="text-muted-foreground text-base">Bir ünite seç ve kelimeleri tekrar et.</p>
        </div>
      </div>

      {/* Two wide columns, not the previous up-to-5-across grid -- each
          card's progress bar/counters need to actually be noticeable at a
          glance, which a narrow 1/5-width card never gave them room for. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {unitStats.map((stat) => (
          <UnitCard key={stat.unitNumber} stat={stat} onStart={() => setActiveUnit(stat.unitNumber)} />
        ))}
      </div>
    </div>
  );
}
