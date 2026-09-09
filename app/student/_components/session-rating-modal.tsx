"use client";

import { useState } from "react";
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
      await submitSessionRating(session.id, rating, feedback.trim() || null);
      onSubmitted();
      onOpenChange(false);
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
