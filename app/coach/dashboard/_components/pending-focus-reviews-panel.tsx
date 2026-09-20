"use client";

import { useState } from "react";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PendingFocusReview } from "../../actions";
import { FocusReviewList } from "../../_components/focus-review-list";

// Dashboard tile for "Onay Bekleyen Süreler": every roster student's Süre Tut
// session over 6 hours that is waiting for a decision. Same compact tile +
// full-review dialog shape as PendingApprovalsPanel next to it.
export function PendingFocusReviewsPanel({ reviews: initialReviews }: { reviews: PendingFocusReview[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [open, setOpen] = useState(false);
  const studentCount = new Set(reviews.map((r) => r.studentId)).size;

  function handleResolved(reviewId: string) {
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  }

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="hover:bg-accent/20 cursor-pointer transition-colors"
      >
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Timer className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Onay Bekleyen Süreler ({reviews.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reviews.length === 0 ? (
            <p className="text-muted-foreground text-xs">Yok</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {studentCount} öğrenciden 6 saati aşan {reviews.length} seans. Onaylanana kadar sıralamaya ve istatistiklere
                eklenmez.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                İncele
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onay Bekleyen Süreler</DialogTitle>
            <DialogDescription>
              Tek seansta 6 saati aşan süreler. Onaylayabilir, gerçekçi bir süreye düşürüp onaylayabilir ya da
              reddedebilirsin.
            </DialogDescription>
          </DialogHeader>
          <FocusReviewList reviews={reviews} showStudent onResolved={handleResolved} />
        </DialogContent>
      </Dialog>
    </>
  );
}
