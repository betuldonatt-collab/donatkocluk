"use client";

import { useState } from "react";
import { Timer } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PendingFocusReview } from "../../../actions";
import { FocusReviewList } from "../../../_components/focus-review-list";

// "Onay Bekleyen Süreler" on the student's detail page -- this student's
// Süre Tut sessions over 6 hours, awaiting the coach's decision. Renders
// nothing when there are none (it's an exception, not a permanent section).
export function PendingFocusReviewsCard({ reviews: initialReviews }: { reviews: PendingFocusReview[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  if (reviews.length === 0) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="size-4 text-amber-600" />
          Onay Bekleyen Süreler ({reviews.length})
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Tek seansta 6 saati aşan süreler. Sen onaylayana kadar öğrencinin sıralamasına ve istatistiklerine eklenmez.
        </p>
      </CardHeader>
      <CardContent>
        <FocusReviewList
          reviews={reviews}
          showStudent={false}
          onResolved={(id) => setReviews((prev) => prev.filter((r) => r.id !== id))}
        />
      </CardContent>
    </Card>
  );
}
