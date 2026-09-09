"use client";

import { useEffect, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { normalizeTr } from "@/lib/curriculum";

export type ResourceOption = { id: string; name: string; is_active?: boolean };

// Searchable "pick or create" combobox for the Kaynak field -- typing a
// name that doesn't match anything in the student's library reveals an
// inline "add to library" confirmation instead of silently discarding it
// or forcing a separate creation step. Verbatim student-panel copy of
// the coach's kanban/resource-combobox.tsx (no coach-specific
// dependencies), per this repo's per-panel UI-duplication convention.
export function ResourceCombobox({
  resources,
  resourceId,
  resourceName,
  addToLibrary,
  onSelectExisting,
  onTypeNew,
  onAddToLibraryChange,
}: {
  resources: ResourceOption[];
  resourceId: string;
  resourceName: string;
  addToLibrary: boolean;
  onSelectExisting: (resource: ResourceOption) => void;
  onTypeNew: (name: string) => void;
  onAddToLibraryChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Archived resources stay resolvable by id/name for a task that's
  // already linked to one, but never show up as a pickable option for a
  // NEW link -- that's the entire point of archiving one.
  const pickableResources = resources.filter((r) => r.is_active !== false);
  const query = resourceName.trim();
  const filtered = query ? pickableResources.filter((r) => normalizeTr(r.name).includes(normalizeTr(query))) : pickableResources;
  const exactMatch = pickableResources.some((r) => normalizeTr(r.name) === normalizeTr(query));
  const isNew = query !== "" && !resourceId && !exactMatch;

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <input
        value={resourceName}
        onChange={(e) => {
          onTypeNew(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Kaynak ara veya yeni kaynak adı yaz..."
        aria-label="Kaynak"
        className="border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />

      {open && (
        <div className="border-border bg-popover text-popover-foreground absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">
                {pickableResources.length === 0 ? "Bu ders için henüz kaynak eklemedin." : "Eşleşen kaynak yok."}
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onSelectExisting(r);
                    setOpen(false);
                  }}
                  className={cn(
                    "hover:bg-accent flex w-full items-center px-3 py-1.5 text-left text-sm",
                    r.id === resourceId && "bg-accent/60 font-medium",
                  )}
                >
                  {r.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {isNew && (
        <label className="text-muted-foreground flex items-start gap-2 text-xs">
          <Checkbox checked={addToLibrary} onCheckedChange={(v) => onAddToLibraryChange(v === true)} className="mt-0.5" />
          <span>Bu kaynak kütüphanende yok, kütüphanene eklensin mi?</span>
        </label>
      )}
    </div>
  );
}
