"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./star-rating";
import { submitSessionRating } from "../actions";
import type { SessionNeedingRating } from "./types";

export function SessionRatingModal({
  session,
  open,
  onOpenChange,
  onSubmitted,
}: {
  session: SessionNeedingRating;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (rating === 0) return;
    setSaving(true);
    try {
      // submitSessionRating never throws -- it always resolves to
      // {ok, data|error} (same contract as updateTaskProgress/
      // saveTaskAnalysis). An uncaught rejection out of a Server Action is
      // exactly what surfaced to the student as a raw React error #441
      // instead of a real message; this outer try/catch is only a backstop
      // for something even earlier failing (e.g. the request itself).
      const result = await submitSessionRating(session.id, rating, feedback.trim() || null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Değerlendirmen kaydedildi, teşekkürler!");
      onSubmitted();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görüşmeni Değerlendir</DialogTitle>
          <DialogDescription>Son koçluk görüşmen nasıldı? Puanla ve istersen kısa bir not bırak.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-2">
          <StarRating value={rating} onChange={setRating} />
        </div>

        <Textarea
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Görüşme hakkında eklemek istediğin bir şey var mı? (opsiyonel)"
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Daha Sonra
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || rating === 0}>
            {saving ? "Kaydediliyor..." : "Gönder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
