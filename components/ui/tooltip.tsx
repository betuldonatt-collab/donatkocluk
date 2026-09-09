"use client";

import { cn } from "@/lib/utils";

// Hand-rolled (no @radix-ui/react-tooltip in package.json, and adding a
// dependency for one hover popover isn't worth it) -- pure CSS via
// group/group-hover, the same pattern already used for this app's other
// hand-rolled popovers (ResourceCombobox, PastWeeksDropdown), just
// hover-triggered instead of click-triggered.
export function Tooltip({ content, children, className }: { content: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="border-border bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs opacity-0 shadow-md transition-opacity group-hover/tooltip:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
