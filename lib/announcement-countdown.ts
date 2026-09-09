// Pure, client-safe (no server imports) so both the student and parent
// announcement side-widgets can share the exact same countdown math --
// mirrors the format already established by NextSessionCard's own
// countdown (app/student/_components/next-session-card.tsx), just
// resolving event_date + optional event_time as the target instead of a
// timestamptz.
export function computeAnnouncementCountdownMs(eventDate: string, eventTime: string | null, now: number): number {
  const timePart = eventTime ? eventTime.slice(0, 5) : "00:00";
  const target = new Date(`${eventDate}T${timePart}:00`).getTime();
  return target - now;
}

export function formatAnnouncementCountdown(ms: number): string {
  if (ms <= 0) return "Etkinlik zamanı geldi";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} gün ${pad(hours)} sa kaldı`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} kaldı`;
}
