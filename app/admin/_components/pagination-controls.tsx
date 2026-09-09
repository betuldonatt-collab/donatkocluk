import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

// Plain ?page=N Link strip -- no client JS needed, server-rendered like
// the rest of the admin panel's list pages.
export function PaginationControls({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const prevHref = currentPage > 1 ? `${basePath}?page=${currentPage - 1}` : null;
  const nextHref = currentPage < totalPages ? `${basePath}?page=${currentPage + 1}` : null;

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button asChild variant="outline" size="sm" disabled={!prevHref}>
        {prevHref ? (
          <Link href={prevHref}>
            <ChevronLeft className="size-4" />
            Önceki
          </Link>
        ) : (
          <span>
            <ChevronLeft className="size-4" />
            Önceki
          </span>
        )}
      </Button>
      <p className="text-muted-foreground text-sm">
        Sayfa {currentPage} / {totalPages}
      </p>
      <Button asChild variant="outline" size="sm" disabled={!nextHref}>
        {nextHref ? (
          <Link href={nextHref}>
            Sonraki
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span>
            Sonraki
            <ChevronRight className="size-4" />
          </span>
        )}
      </Button>
    </div>
  );
}
