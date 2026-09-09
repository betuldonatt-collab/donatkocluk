import * as Sentry from "@sentry/nextjs";

// Next.js's native client-instrumentation entry point (stable since 15.3) --
// the modern replacement for the older `sentry.client.config.ts` convention,
// which the installed SDK itself now warns against double-initializing
// alongside this file. Runs once, before hydration.
//
// A missing NEXT_PUBLIC_SENTRY_DSN (local dev, a PR preview without the
// secret) leaves dsn undefined -- Sentry.init() treats that as "disabled"
// rather than throwing, so this file is always safe to load regardless of env.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

// Required by the SDK to attribute errors to the App Router navigation
// that was in flight when they happened.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
