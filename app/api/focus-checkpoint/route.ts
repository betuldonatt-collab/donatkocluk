import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { pauseFocusSession } from "@/app/student/actions";

// Second Route Handler in this codebase (the first: kaynak-kutuphanesi/
// bulk-add) -- exists for the same reason a Server Action can't be used
// here: `navigator.sendBeacon` (fired from FocusTimerModal's `beforeunload`
// handler, the one moment a fetch initiated from unload is reliably
// delivered) can only POST to a plain URL, not invoke the Next.js Server
// Action RPC protocol. This just calls the same pauseFocusSession Server
// Action directly -- both are plain server-side functions, so no separate
// logic to keep in sync. A real tab close is a trustworthy "ending now"
// signal, so this cleanly pauses (banks the live segment, keeps the
// session resumable) rather than leaving the row to be reconciled later
// as merely stale.
//
// sendBeacon sets its own Content-Type from the Blob it's given and
// carries same-origin cookies automatically, so the request reaches here
// authenticated exactly like any other same-origin fetch.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      console.error("[api/focus-checkpoint] invalid JSON body:", e);
      return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const { taskId } = (body ?? {}) as { taskId?: unknown };
    if (typeof taskId !== "string" || !taskId) {
      return NextResponse.json({ ok: false, error: "Eksik görev id'si." }, { status: 400 });
    }

    await pauseFocusSession(taskId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // sendBeacon never reads the response body, so there's nothing to
    // report back to the page -- this just makes sure a failure lands in
    // Sentry instead of silently disappearing, same as bulk-add's own
    // catch-all.
    console.error("[api/focus-checkpoint] unexpected error:", e);
    Sentry.captureException(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu." },
      { status: 500 },
    );
  }
}
