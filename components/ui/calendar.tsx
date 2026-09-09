"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tr } from "date-fns/locale";
import { DayPicker, type DayButtonProps } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  return (
    <button
      type="button"
      data-day={day.date.toLocaleDateString()}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "size-9 rounded-md p-0 font-normal aria-selected:opacity-100",
        modifiers.today && !modifiers.selected && "bg-accent text-accent-foreground",
        modifiers.selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        (modifiers.range_start || modifiers.range_end) &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
        modifiers.range_middle && "bg-accent text-accent-foreground rounded-none",
        modifiers.outside && "text-muted-foreground opacity-50",
        modifiers.disabled && "text-muted-foreground opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={{ ...tr, labels: { labelPrevious: () => "Önceki ay", labelNext: () => "Sonraki ay" } }}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 px-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday: "text-muted-foreground w-9 rounded-md text-[0.8rem] font-normal",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        range_start: "rounded-l-md",
        range_end: "rounded-r-md",
        range_middle: "rounded-none",
        today: "font-semibold",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...chevronProps} />
          ) : (
            <ChevronRight className="size-4" {...chevronProps} />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

export { Calendar };
