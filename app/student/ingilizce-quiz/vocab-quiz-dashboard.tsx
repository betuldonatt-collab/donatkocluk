"use client";

import { useState } from "react";
import { BookOpenCheck, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pastelGreenForProgress, vocabUnitTitle, type UnitStat } from "@/lib/lgs-vocab";
import { VocabQuizSession } from "./vocab-quiz-session";

function UnitCard({ stat, onStart }: { stat: UnitStat; onStart: () => void }) {
  const pct = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0;
  const complete = stat.total > 0 && stat.mastered === stat.total;
  // The fill "levels up" through soft green shades as mastered grows
  // (pastelGreenForProgress, lib/lgs-vocab.ts) instead of one flat color at
  // every percentage -- the completed card's own accent reuses the same
  // deepest step as a tint, so it reads as the natural top of the same
  // scale rather than a second, unrelated color.
  const fillColor = pastelGreenForProgress(pct);
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
            <span className="text-muted-foreground text-sm">Öğrenildi</span>
            <span className="text-foreground text-lg font-semibold tabular-nums">
              {stat.mastered}/{stat.total}
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

  // Called whenever a word transitions to mastered during a session, so the
  // dashboard's own counters are correct the moment the student exits back
  // to it -- without needing a full server round-trip/page reload.
  function handleWordMastered(unitNumber: number) {
    setUnitStats((prev) => prev.map((s) => (s.unitNumber === unitNumber ? { ...s, mastered: s.mastered + 1 } : s)));
  }

  if (activeUnit !== null) {
    return (
      <VocabQuizSession
        unitNumber={activeUnit}
        onExit={() => setActiveUnit(null)}
        onWordMastered={() => handleWordMastered(activeUnit)}
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
