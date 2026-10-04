// What happens when a student presses "Süre Tut" on a task that already has a
// focus session on the server:
//
//   "bank"   -- a PAUSED leftover (the student took a Mola and never came
//               back): its accumulated time is final, so it is credited on the
//               spot and the student is told how much was logged.
//   "attach" -- a RUNNING session, however old its last heartbeat is. It is
//               never closed on the system's say-so: a locked phone or a
//               backgrounded app stops heartbeating, so "no heartbeat" does not
//               mean "abandoned", and ending it would kill a timer the student
//               may be using on another device. The fullscreen timer shows it,
//               still running. (If it is running on a DIFFERENT device than the
//               one pressing Süre Tut, the client asks the student whether to
//               stop it -- see lib/focus-device.ts. A session that has run past
//               3 hours owes the "still studying?" check-in either way.)
//
// Either way no time is ever lost: a running session is credited through now
// whenever it is finally ended.
export type OpenDecision = "attach" | "bank";

export function decideOpenAction(session: { status: "running" | "paused" }): OpenDecision {
  return session.status === "paused" ? "bank" : "attach";
}
