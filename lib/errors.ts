import * as Sentry from "@sentry/nextjs";

// Security Hardening (Group 5 -- Error Sanitization): a raw Postgres/
// PostgREST error can carry constraint names, column names, or other
// schema internals that have no business reaching the client. Every
// server action that used to do `if (error) throw new Error(error.message)`
// now does `if (error) throw dbError(error)` instead -- the real error
// still gets logged (stderr, with a stack trace that identifies which
// action threw it) and reported to Sentry, but the client only ever sees
// this one generic, friendly message.
export const GENERIC_DB_ERROR = "Beklenmeyen bir hata oluştu, lütfen tekrar deneyin.";

export function dbError(error: unknown): Error {
  console.error("[db error]", error);
  Sentry.captureException(error);
  return new Error(GENERIC_DB_ERROR);
}
