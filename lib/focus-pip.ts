// Pops the running Süre Tut timer out into a small always-on-top window, so it
// stays visible on top of OTHER apps and websites -- YouTube in another tab,
// another program, anything. (A web page can never draw over another website;
// an OS-level Picture-in-Picture window is the one supported way.)
//
// Two mechanisms, best one first:
//   1. Document Picture-in-Picture API (Chrome / Edge 116+, desktop): a real
//      small browser window we fill with our own DOM.
//   2. Video Picture-in-Picture fallback (Safari, and Chromium where the first
//      is missing): the timer is drawn onto a <canvas>, streamed into a hidden
//      <video>, and that video is popped out.
// Anywhere neither exists (Firefox, most phones) isPipSupported() is false and
// the buttons that would open it aren't shown.
//
// The window is display-only (time, mode, task): starting, pausing and ending
// stay in the app, so nothing here can affect what gets recorded. It is driven
// from outside via updatePip() -- a plain module, so it survives React
// re-renders and page navigation, and it must be opened from a user gesture
// (a click) or browsers refuse.

export type PipSnapshot = {
  time: string; // "01:25:30"
  label: string; // "Kronometre çalışıyor"
  taskTitle: string;
  running: boolean;
};

type PipWindowApi = { requestWindow(options?: { width?: number; height?: number }): Promise<Window> };

function documentPipApi(): PipWindowApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: PipWindowApi }).documentPictureInPicture ?? null;
}

function videoPipSupported(): boolean {
  if (typeof document === "undefined") return false;
  return (
    !!document.pictureInPictureEnabled &&
    typeof HTMLVideoElement !== "undefined" &&
    typeof HTMLVideoElement.prototype.requestPictureInPicture === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

export function isPipSupported(): boolean {
  return documentPipApi() !== null || videoPipSupported();
}

// --- open/closed state, observable from React (useSyncExternalStore) --------

const listeners = new Set<() => void>();
let open = false;
let last: PipSnapshot = { time: "00:00", label: "", taskTitle: "", running: false };

function setOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export const pipStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => open,
  getServerSnapshot: () => false,
};

// --- document mode ---------------------------------------------------------

type DocRefs = { win: Window; time: HTMLElement; label: HTMLElement; task: HTMLElement };
let docRefs: DocRefs | null = null;

function el(doc: Document, style: string): HTMLDivElement {
  const node = doc.createElement("div");
  node.style.cssText = style;
  return node;
}

function buildDocument(win: Window): DocRefs {
  const doc = win.document;
  doc.title = "Süre Tut";
  doc.body.style.cssText = "margin:0;background:#0f172a;";
  const root = el(
    doc,
    "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;box-sizing:border-box;padding:8px;text-align:center;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;",
  );
  const time = el(doc, "font-size:46px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1;");
  const label = el(doc, "font-size:12px;opacity:.75;margin-top:6px;");
  const task = el(
    doc,
    "font-size:11px;opacity:.6;margin-top:6px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  );
  root.append(time, label, task);
  doc.body.append(root);
  return { win, time, label, task };
}

function paintDocument(snapshot: PipSnapshot) {
  if (!docRefs) return;
  docRefs.time.textContent = snapshot.time;
  docRefs.time.style.color = snapshot.running ? "#f8fafc" : "#94a3b8";
  docRefs.label.textContent = snapshot.label;
  docRefs.task.textContent = snapshot.taskTitle;
}

// --- video mode ------------------------------------------------------------

let canvas: HTMLCanvasElement | null = null;
let video: HTMLVideoElement | null = null;

function paintCanvas(snapshot: PipSnapshot) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = snapshot.running ? "#f8fafc" : "#94a3b8";
  ctx.font = "700 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(snapshot.time, canvas.width / 2, 92);
  ctx.fillStyle = "rgba(248,250,252,0.75)";
  ctx.font = "16px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(snapshot.label, canvas.width / 2, 124);
  ctx.fillStyle = "rgba(248,250,252,0.6)";
  ctx.font = "14px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(snapshot.taskTitle.slice(0, 38), canvas.width / 2, 152);
}

function teardown() {
  docRefs = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
    video = null;
  }
  canvas = null;
  setOpen(false);
}

// --- public API ------------------------------------------------------------

export type OpenPipResult = "opened" | "unsupported" | "failed";

// MUST be called directly from a click handler (browsers require a user
// gesture). Resolves "opened" once the window is up.
export async function openPip(): Promise<OpenPipResult> {
  if (open) return "opened";
  try {
    const docApi = documentPipApi();
    if (docApi) {
      const win = await docApi.requestWindow({ width: 320, height: 150 });
      docRefs = buildDocument(win);
      win.addEventListener("pagehide", teardown);
      paintDocument(last);
      setOpen(true);
      return "opened";
    }

    if (videoPipSupported()) {
      canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      paintCanvas(last);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      // Kept in the page (invisible) -- some browsers won't pop out a detached video.
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.append(video);
      video.srcObject = canvas.captureStream(2);
      video.addEventListener("leavepictureinpicture", teardown);
      await video.play();
      await video.requestPictureInPicture();
      setOpen(true);
      return "opened";
    }
    return "unsupported";
  } catch {
    teardown();
    return "failed";
  }
}

// Repaints the window with the latest reading. Cheap and safe to call every
// tick; a no-op while nothing is open.
export function updatePip(snapshot: PipSnapshot): void {
  last = snapshot;
  if (!open) return;
  if (docRefs) paintDocument(snapshot);
  else paintCanvas(snapshot);
}

export function closePip(): void {
  if (docRefs) {
    const { win } = docRefs;
    teardown();
    win.close();
    return;
  }
  if (video && document.pictureInPictureElement === video) {
    document.exitPictureInPicture().catch(() => {});
  }
  teardown();
}
