// TEMPORARY diagnostics for the slow parent student-switch. Everything logs with
// the "[perf]" prefix so it can be found in the Vercel runtime logs (filter:
// "[perf]") and removed again with a single search.
//
//   - perfFetch: wraps every Supabase HTTP call made from server code (database
//     REST, auth, storage) and logs the slow ones -- so one switch shows exactly
//     WHICH request took how long, without touching each query site.
//   - logPerf: a labelled phase timing (layout, page, server action).
//
// Threshold: only calls slower than PERF_SLOW_MS are logged (default 150 ms),
// unless PERF_LOG=all, which logs every call.

const SLOW_MS = Number(process.env.PERF_SLOW_MS ?? 150);
const LOG_ALL = process.env.PERF_LOG === "all";

function describe(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const u = new URL(raw);
    // path only (which table / endpoint), never the query string: it can hold ids
    return u.pathname.replace(/\/rest\/v1\//, "db:").replace(/\/auth\/v1\//, "auth:").replace(/\/storage\/v1\//, "storage:");
  } catch {
    return "unknown";
  }
}

export const perfFetch: typeof fetch = async (input, init) => {
  const start = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    const ms = Math.round(performance.now() - start);
    if (LOG_ALL || ms >= SLOW_MS) {
      console.log(`[perf] ${(init?.method ?? "GET").padEnd(4)} ${describe(input)} ${ms}ms`);
    }
  }
};

// A clock reading behind a function call, so callers do not read performance.now()
// directly in a component body (react-hooks/purity).
export function startPerf(): number {
  return performance.now();
}

export function logPerf(label: string, startedAt: number): void {
  console.log(`[perf] ${label} ${Math.round(performance.now() - startedAt)}ms total`);
}
