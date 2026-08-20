const SIZE = 96;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PieChart({
  label,
  solved,
  total,
  emphasized = false,
}: {
  label: string;
  solved: number;
  total: number;
  emphasized?: boolean;
}) {
  const fraction = total === 0 ? 0 : solved / total;
  const percent = Math.round(fraction * 100);
  const dash = fraction * CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            className="stroke-muted"
            strokeWidth={STROKE}
          />
          {total > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={emphasized ? "var(--primary)" : "var(--muted-foreground)"}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-foreground text-lg font-semibold tabular-nums">
            {percent}%
          </span>
          <span className="text-muted-foreground text-[10px] tabular-nums">
            {solved}/{total}
          </span>
        </div>
      </div>
      <span
        className={
          emphasized
            ? "text-foreground text-sm font-medium"
            : "text-muted-foreground max-w-[7rem] truncate text-xs"
        }
        title={label}
      >
        {label}
      </span>
    </div>
  );
}
