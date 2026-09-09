"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { stopImpersonation } from "@/lib/impersonation-actions";

export function ImpersonationBanner({ targetName }: { targetName: string }) {
  const [exiting, setExiting] = useState(false);

  async function handleExit() {
    setExiting(true);
    await stopImpersonation();
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950">
      <span className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0" />
        🚨 Şu an {targetName} görünümündesiniz (Salt Okunur).
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="shrink-0 rounded-md bg-amber-950/10 px-3 py-1 font-semibold transition-colors hover:bg-amber-950/20 disabled:opacity-50"
      >
        {exiting ? "Çıkılıyor..." : "Görünümden Çık"}
      </button>
    </div>
  );
}
