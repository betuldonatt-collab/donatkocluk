// A 500 ms heartbeat that keeps ticking while the tab is in the background.
//
// Browsers throttle setInterval in a hidden tab -- to once a second, then (after
// about five minutes) to once a MINUTE -- so a timer display driven by
// setInterval freezes while the student is on another tab (YouTube, ...). Timers
// inside a dedicated Web Worker are not subject to that throttling, and a
// message from the worker reaches the page regardless of visibility, so the tab
// title and the Picture-in-Picture window can keep counting.
//
// One shared worker serves every subscriber and is torn down when the last one
// leaves. If a Worker can't be created (no Worker/Blob support, a strict CSP)
// it silently falls back to a plain setInterval -- degraded in the background,
// but never broken.

const TICK_MS = 500;
const WORKER_SOURCE = `setInterval(() => postMessage(0), ${TICK_MS});`;

const subscribers = new Set<() => void>();
let worker: Worker | null = null;
let workerUrl: string | null = null;
let fallbackId: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const callback of subscribers) callback();
}

function start() {
  if (worker || fallbackId !== null) return;
  try {
    workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    worker.onmessage = emit;
    worker.onerror = () => {
      // The worker died (or was blocked): keep ticking on the page's own timer.
      stop();
      fallbackId = setInterval(emit, TICK_MS);
    };
  } catch {
    stop();
    fallbackId = setInterval(emit, TICK_MS);
  }
}

function stop() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (workerUrl) {
    URL.revokeObjectURL(workerUrl);
    workerUrl = null;
  }
  if (fallbackId !== null) {
    clearInterval(fallbackId);
    fallbackId = null;
  }
}

// Calls `callback` every ~500 ms, in the foreground or background. Returns the
// unsubscribe function.
export function subscribeTick(callback: () => void): () => void {
  subscribers.add(callback);
  start();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) stop();
  };
}
