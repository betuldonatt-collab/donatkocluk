"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateToISO, formatChartRangeLabel, isoToDate, LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";

function toDateRange(value: ChartRange): DateRange | undefined {
  return value.type === "custom" ? { from: isoToDate(value.startDate), to: isoToDate(value.endDate) } : undefined;
}

// Trigger button + Popover(preset + Calendar) for picking the Paragraf/
// Problem charts' date range. Purely presentational/controlled -- the
// caller owns the ChartRange state and decides how to turn it into chart
// data (fetch vs. client-side filter differs per panel).
export function ChartRangePicker({ value, onChange }: { value: ChartRange; onChange: (range: ChartRange) => void }) {
  const [open, setOpen] = useState(false);
  // The Calendar's own live selection, separate from the committed `value`.
  // react-day-picker's range mode needs the FIRST click's (from, to:
  // undefined) result fed back as `selected` on the next render to know
  // what the second click is extending -- committing only complete ranges
  // to `value` would make every click look like a fresh first click.
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(toDateRange(value));

  function handleOpenChange(next: boolean) {
    if (next) setPendingRange(toDateRange(value));
    setOpen(next);
  }

  function handleSelect(range: DateRange | undefined) {
    setPendingRange(range);
    // Ignore the in-progress single-date selection (only `from` picked) --
    // wait for a complete range before applying it to the chart.
    if (!range?.from || !range.to) return;
    onChange({ type: "custom", startDate: dateToISO(range.from), endDate: dateToISO(range.to) });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <CalendarIcon className="size-4" />
          {formatChartRangeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="space-y-3">
          <Button
            type="button"
            variant={value.type === "last30" ? "default" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => {
              onChange(LAST_30_DAYS_RANGE);
              setOpen(false);
            }}
          >
            Son 30 Gün
          </Button>
          <Calendar
            mode="range"
            selected={pendingRange}
            onSelect={handleSelect}
            defaultMonth={pendingRange?.to ?? pendingRange?.from}
            // Forces a real two-click pick (start day, then a later day) --
            // without this, react-day-picker treats a single click as a
            // complete same-day range and applies+closes immediately.
            min={1}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
