import type { Instrumentation } from "next";
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
// render failures, Route Handler throws, and Server Action crashes.
// console.error here is the primary debugging channel right now (visible
// in Vercel's Runtime Logs, or the local terminal running `npm run dev`,
// with no Sentry account needed) -- it prints the FULL, untruncated error,
// since production strips the real message/stack from whatever reaches
// the client-side error boundary, leaving only the `digest` there. Sentry
// still gets it too (captureRequestError), left in place for later even
// though it isn't the primary tool being used right now.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  console.error("[onRequestError]", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    digest: typeof error === "object" && error !== null && "digest" in error ? error.digest : undefined,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
  await Sentry.captureRequestError(error, request, context);
};
