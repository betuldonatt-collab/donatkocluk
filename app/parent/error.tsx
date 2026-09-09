"use client";

import { DashboardError } from "@/components/dashboard-error";

export default function ParentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError error={error} reset={reset} homeHref="/parent" />;
}
