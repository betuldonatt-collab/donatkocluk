"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMoreCoachReviews } from "../../../actions";
import { COACH_REVIEWS_PAGE_SIZE } from "../constants";

type Review = {
  id: string;
  studentName: string;
  scheduledAt: string;
  rating: number | null;
  feedback: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewsList({
  coachId,
  initialReviews,
  initialHasMore,
}: {
  coachId: string;
  initialReviews: Review[];
  initialHasMore: boolean;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await getMoreCoachReviews(coachId, reviews.length);
      setReviews((prev) => [...prev, ...more]);
      setHasMore(more.length === COACH_REVIEWS_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  if (reviews.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz yorum yok.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="border-border rounded-lg border p-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-foreground text-sm font-medium">{r.studentName}</span>
            {r.rating !== null && (
              <span className="flex items-center gap-0.5 text-amber-600 text-xs">
                <Star className="size-3 fill-current" />
                {r.rating}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{formatDateTime(r.scheduledAt)}</p>
          <p className="text-foreground mt-1 text-sm">{r.feedback}</p>
        </div>
      ))}
      {hasMore && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
        </Button>
      )}
    </div>
  );
}
