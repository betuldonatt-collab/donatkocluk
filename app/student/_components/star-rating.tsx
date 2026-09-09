"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const display = hoverValue ?? value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHoverValue(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHoverValue(star)}
          aria-label={`${star} yıldız`}
        >
          <Star
            className={cn(
              "size-7 transition-colors",
              star <= display ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}
