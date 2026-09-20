"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeTr } from "@/lib/curriculum";

// `group` is optional: consecutive options sharing one render under a
// single small heading (LGS's SÖZEL / SAYISAL subject grouping). Options
// without it -- every existing YKS picker -- render exactly as before.
export type ComboboxOption = { id: string; label: string; group?: string };

// Searchable dropdown -- typing "tyt mat" filters down to "TYT Matematik"
// regardless of case or Turkish diacritics (see normalizeTr). Verbatim
// student-panel copy of the coach's kanban/smart-combobox.tsx (it has no
// coach-specific dependencies, only @/lib/utils and @/lib/curriculum) --
// matches this repo's per-panel UI-duplication convention rather than a
// cross-panel import.
export function SmartCombobox({
  options,
  value,
  onChange,
  placeholder = "Ara...",
  ariaLabel,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => normalizeTr(o.label).includes(normalizeTr(query)))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className="border-input bg-background flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </button>

      {open && (
        <div className="border-border bg-popover text-popover-foreground absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="border-border bg-background w-full border-b px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">Sonuç yok</p>
            ) : (
              filtered.map((o, i) => (
                <Fragment key={o.id}>
                  {o.group && o.group !== filtered[i - 1]?.group && (
                    <p className="text-muted-foreground px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide uppercase">{o.group}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "hover:bg-accent flex w-full items-center px-3 py-1.5 text-left text-sm",
                      o.id === value && "bg-accent/60 font-medium",
                    )}
                  >
                    {o.label}
                  </button>
                </Fragment>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
