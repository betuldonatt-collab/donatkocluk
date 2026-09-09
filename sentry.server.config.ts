import * as Sentry from "@sentry/nextjs";

// Imported from instrumentation.ts's register() on the nodejs runtime only.
// A missing SENTRY_DSN (local dev, a PR preview without the secret) leaves
// dsn undefined -- Sentry.init() treats that as "disabled" rather than
// throwing, so this file is always safe to import regardless of env.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
});
