import type { Stat } from "@/lib/curriculum/topic-groups";

// A unit's whole-unit question numbers, as a small line under the vertical Ünite label in Kaynak Takibi (LGS Fen Bilimleri,
// whose "(Genel)" row and parent row are not shown there): Toplam / Doğru / Yanlış / Boş of the unit's master topic AND every
// Konu of it -- so what was recorded for "the unit as a whole" stays visible without a row of its own. Nothing is rendered
// for a unit with no numbers yet.
export function UnitTotalLine({ stat }: { stat: Stat }) {
  if (stat.total + stat.correct + stat.wrong + stat.empty === 0) return null;
  return (
    <div
      className="border-border/60 flex w-full flex-col items-center gap-0.5 border-t pt-1.5 text-[10px] leading-none font-semibold tabular-nums"
      title={`Ünite toplamı (tüm konular dahil): ${stat.total} soru, ${stat.correct} doğru, ${stat.wrong} yanlış, ${stat.empty} boş`}
      data-unit-total
    >
      <span>T {stat.total}</span>
      <span className="text-emerald-700">D {stat.correct}</span>
      <span className="text-rose-700">Y {stat.wrong}</span>
      <span className="text-amber-700">B {stat.empty}</span>
    </div>
  );
}
