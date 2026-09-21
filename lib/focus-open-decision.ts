import { STILL_STUDYING_INTERVAL_SECONDS } from "./focus-confirmation";

// What happens when a student presses "Süre Tut" on a task that already has a
// focus session on the server (there is no "Kaldığım yerden devam edeyim mi?"
// question any more):
//
//   "bank"   -- the leftover session is closed out on the spot: its time is
//               credited to the task and the student is told how much was
//               logged, then a fresh timer can be started.
//   "attach" -- the session is genuinely alive right now (running in another
//               tab / the floating widget / another device, or so long it owes
//               a "still studying?" check-in), so banking it would end a timer
//               the student is actively using. The fullscreen timer simply
//               shows it, already running.
//
// Either way no time is ever lost.

// A running session whose page reported in (heartbeat, every ~20 s) this
// recently is considered alive. Generous, because a hidden tab throttles its
// timers to about once a minute.
export const ACTIVE_HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;

export type OpenDecision = "attach" | "bank";

export function decideOpenAction(
  session: { status: "running" | "paused"; lastHeartbeatAt: string; elapsedSeconds: number },
  nowMs: number = Date.now(),
): OpenDecision {
  // Paused = the student took a Mola and never came back: its accumulated
  // time is final, so just bank it.
  if (session.status === "paused") return "bank";

  const heartbeatAgeMs = nowMs - new Date(session.lastHeartbeatAt).getTime();
  if (heartbeatAgeMs <= ACTIVE_HEARTBEAT_WINDOW_MS) return "attach";

  // Running but nothing has reported in for a while (tab closed, laptop
  // asleep). A short one is simply banked. One past the 3-hour mark still owes
  // the "Hâlâ çalışmaya devam ediyor musun?" check-in (which also lets the
  // student correct the figure), so show it instead of silently crediting
  // hours nobody confirmed.
  return session.elapsedSeconds > STILL_STUDYING_INTERVAL_SECONDS ? "attach" : "bank";
}
