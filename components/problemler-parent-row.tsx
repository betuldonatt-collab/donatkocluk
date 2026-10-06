import { TableCell, TableRow } from "@/components/ui/table";
import { PipelineFillerCell } from "@/components/topic-pipeline";
import { PROBLEMLER_UNIT_LABEL, type Stat } from "@/lib/curriculum/problemler";

// The parent "Problemler" row of TYT Matematik's Kaynak Takibi table (student and coach): the title with the
// CUMULATIVE Toplam / D / Y / B of the whole Problemler section (its master topic, every subtopic and the standalone
// Problem routine) in the same four stat columns every topic row uses, and the unit cell the section's rows share.
export function ProblemlerParentRow({
  stat,
  unitRowSpan,
  resourceCount,
  startFiller,
  endFiller,
}: {
  stat: Stat;
  unitRowSpan: number;
  resourceCount: number;
  // How many pipeline columns sit before / after the resource columns (0 when the table has none).
  startFiller: number;
  endFiller: number;
}) {
  const hasData = stat.total > 0;
  return (
    <TableRow className="bg-muted/40" data-problemler-parent>
      <TableCell className="text-center font-semibold tabular-nums">{hasData ? stat.total : "–"}</TableCell>
      <TableCell className="text-center font-semibold tabular-nums text-emerald-700">{hasData ? stat.correct : "–"}</TableCell>
      <TableCell className="text-center font-semibold tabular-nums text-rose-700">{hasData ? stat.wrong : "–"}</TableCell>
      <TableCell className="text-center font-semibold tabular-nums text-amber-700">{hasData ? stat.empty : "–"}</TableCell>
      <TableCell rowSpan={unitRowSpan} className="bg-card sticky left-0 z-10 border-l border-r p-0 text-center align-middle">
        <div className="flex h-full items-center justify-center py-2">
          <span className="[writing-mode:vertical-rl] rotate-180 font-medium">{PROBLEMLER_UNIT_LABEL}</span>
        </div>
      </TableCell>
      <TableCell className="bg-muted/40 sticky left-12 z-10 border-r font-semibold whitespace-normal">{PROBLEMLER_UNIT_LABEL}</TableCell>
      {startFiller > 0 && <PipelineFillerCell count={startFiller} />}
      {Array.from({ length: resourceCount }, (_, i) => (
        <TableCell key={i} colSpan={2} className="border-l" />
      ))}
      {endFiller > 0 && <PipelineFillerCell count={endFiller} />}
    </TableRow>
  );
}
