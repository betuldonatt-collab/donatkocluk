"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { SessionNeedingRating } from "./types";
import { SessionRatingModal } from "./session-rating-modal";

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

export function SessionRatingBanner({ session }: { session: SessionNeedingRating | null }) {
  const [modalOpen, setModalOpen] = useState(() => session !== null);
  const [submitted, setSubmitted] = useState(false);

  if (!session || submitted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-left transition-colors hover:bg-amber-500/15"
      >
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <p className="text-sm font-semibold text-amber-700">
          {formatSessionDate(session.scheduled_at)} tarihli görüşmeni değerlendir
        </p>
      </button>

      <SessionRatingModal
        session={session}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmitted={() => setSubmitted(true)}
      />
    </>
  );
}
