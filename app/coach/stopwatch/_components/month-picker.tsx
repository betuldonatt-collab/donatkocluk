"use client";

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const PAST_MONTHS_COUNT = 12;

function buildMonthOptions() {
  const now = new Date();
  const options: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < PAST_MONTHS_COUNT; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    options.push({ year, month, label: `${MONTH_LABELS[month - 1]} ${year}` });
  }
  return options;
}

export function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const options = buildMonthOptions();
  const value = `${year}-${month}`;

  return (
    <select
      value={value}
      onChange={(e) => {
        const [nextYear, nextMonth] = e.target.value.split("-").map(Number);
        onChange(nextYear, nextMonth);
      }}
      className="border-input bg-background text-foreground h-10 md:h-9 rounded-md border px-3 text-sm"
    >
      {options.map((opt) => (
        <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
