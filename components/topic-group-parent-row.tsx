import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PipelineFillerCell } from "@/components/topic-pipeline";
import type { Stat } from "@/lib/curriculum/topic-groups";

// The parent row of a grouped unit in Kaynak Takibi (student and coach), e.g. "Problemler", "Dalgalar", "Trigonometri":
// the unit's title with the CUMULATIVE Toplam / D / Y / B of the whole group (its master topic and every subtopic) in
// the same four stat columns every topic row uses, and the unit cell the group's rows share.
export function TopicGroupParentRow({
  label,
  stat,
  unitRowSpan,
  resourceCount,
  startFiller,
  endFiller,
  statRowSpan,
}: {
  label: string;
  stat: Stat;
  unitRowSpan: number;
  // Set when the unit's stats are shown once for the whole unit: the four stat cells then span this many rows (the
  // parent row and every row of the unit), and the unit's own rows have none.
  statRowSpan?: number;
  resourceCount: number;
  // How many pipeline columns sit before / after the resource columns (0 when the table has none).
  startFiller: number;
  endFiller: number;
}) {
  const hasData = stat.total > 0;
  return (
    <TableRow className="bg-muted/40" data-topic-group-parent>
      <TableCell rowSpan={statRowSpan} className={cn("text-center font-semibold tabular-nums", statRowSpan && "bg-muted/40 align-middle")}>{hasData ? stat.total : "–"}</TableCell>
      <TableCell rowSpan={statRowSpan} className={cn("text-center font-semibold tabular-nums text-emerald-700", statRowSpan && "bg-muted/40 align-middle")}>{hasData ? stat.correct : "–"}</TableCell>
      <TableCell rowSpan={statRowSpan} className={cn("text-center font-semibold tabular-nums text-rose-700", statRowSpan && "bg-muted/40 align-middle")}>{hasData ? stat.wrong : "–"}</TableCell>
      <TableCell rowSpan={statRowSpan} className={cn("text-center font-semibold tabular-nums text-amber-700", statRowSpan && "bg-muted/40 align-middle")}>{hasData ? stat.empty : "–"}</TableCell>
      <TableCell rowSpan={unitRowSpan} className="bg-card sticky left-0 z-10 border-l border-r p-0 text-center align-middle">
        <div className="flex h-full items-center justify-center py-2">
          <span className="[writing-mode:vertical-rl] rotate-180 font-medium">{label}</span>
        </div>
      </TableCell>
      <TableCell className="bg-muted/40 sticky left-12 z-10 border-r font-semibold whitespace-normal">{label}</TableCell>
      {startFiller > 0 && <PipelineFillerCell count={startFiller} />}
      {Array.from({ length: resourceCount }, (_, i) => (
        <TableCell key={i} colSpan={2} className="border-l" />
      ))}
      {endFiller > 0 && <PipelineFillerCell count={endFiller} />}
    </TableRow>
  );
}
