// The browser-tab title as a live readout of a running Süre Tut timer, so a
// student who has switched to another tab (a lecture on YouTube, ...) still
// sees the time in the tab bar. A web page can't draw over another website;
// the tab title is the one thing that stays visible.

// hh:mm:ss from one hour up, mm:ss below.
export function formatTimerClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${mmss}` : mmss;
}

const RUNNING_PREFIX = "⏳ ";
const ASKING_PREFIX = "⏰ ";

// "⏳ 01:25:30" -- or, while the "Hâlâ çalışmaya devam ediyor musun?" check-in
// is waiting for an answer, "⏰ Hâlâ çalışıyor musun? 01:25:30" so it isn't
// missed in a background tab.
export function formatTimerTitle(seconds: number, asking = false): string {
  const clock = formatTimerClock(seconds);
  return asking ? `${ASKING_PREFIX}Hâlâ çalışıyor musun? ${clock}` : `${RUNNING_PREFIX}${clock}`;
}

// --- applying it -----------------------------------------------------------
// Remembers the page's real title so it can be put back, but re-learns it if
// something else (a route change in Next) replaced it while we were showing
// the timer.

let baseTitle: string | null = null;

function isOurTitle(title: string): boolean {
  return title.startsWith(RUNNING_PREFIX) || title.startsWith(ASKING_PREFIX);
}

// text = the timer title to show, or null to restore the original title.
export function setTimerTitle(text: string | null): void {
  if (typeof document === "undefined") return;
  if (text === null) {
    if (baseTitle !== null) {
      document.title = baseTitle;
      baseTitle = null;
    }
    return;
  }
  if (!isOurTitle(document.title)) baseTitle = document.title;
  document.title = text;
}
