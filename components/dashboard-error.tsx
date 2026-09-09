"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

// Shared friendly error UI for every role's own error.tsx -- Next.js
// requires error.tsx itself to be a per-segment Client Component (it can't
// be shared directly across app/student, app/coach, app/parent, app/admin
// as one file), so each role's error.tsx is a thin wrapper around this one
// real implementation, passing only its own home link. Without this,
// a thrown server-component error (a stale bookmark to a reassigned
// student, an RLS denial, a network blip) surfaced Next.js's raw
// dev-style stack trace to end users -- including non-technical parents
// and students who have no idea what a "stack trace" is.
export function DashboardError({ error, reset, homeHref }: { error: Error & { digest?: string }; reset: () => void; homeHref: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="text-destructive size-6" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-foreground text-lg font-semibold">Bir şeyler ters gitti</h1>
        <p className="text-muted-foreground text-sm">
          Bu sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar denemek genellikle sorunu çözer.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          <RotateCw className="size-4" />
          Tekrar Dene
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href={homeHref}>Ana Sayfaya Dön</Link>
        </Button>
      </div>
    </div>
  );
}
