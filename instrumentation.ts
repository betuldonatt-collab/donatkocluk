import * as Sentry from "@sentry/nextjs";

// Called once when a new server instance starts, before it handles any
// requests. Only the nodejs runtime is wired up here -- this app has no
// edge-runtime routes to instrument (proxy.ts is out of scope: it's a
// pre-render request hook, not a page/action, and wasn't part of this ask).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// Reports server-side errors Next.js itself catches -- Server Component
// render failures, Route Handler throws, and Server Action crashes -- to
// Sentry automatically, independent of whether the throwing code also goes
// through lib/errors.ts's dbError() chokepoint.
export const onRequestError = Sentry.captureRequestError;
