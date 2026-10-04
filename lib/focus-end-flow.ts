// Ending a Süre Tut session (Bitir, "Hayır, bitir", "Durdur") -- shared by the
// fullscreen timer's trigger and the floating widget so both behave the same:
//
//  * every attempt has a 15 s timeout and a failed one is retried twice
//    (ending is idempotent: ending a session that is already gone is not an
//    error), so a flaky mobile connection or a hung request does not leave the
//    student with an endless "Süren kaydediliyor…";
//  * if it still fails the failure is LOUD: a persistent toast with "Tekrar
//    dene" and the widget's card turns red (focusFailedEndStore) -- the session
//    is still running on the server, and it never goes back to looking like an
//    ordinary running timer;
//  * what the student is told afterwards is what the server really banked
//    (lib/focus-end-outcome.ts), including a plain-language explanation when it
//    differs from what their own timer showed.
"use client";

import { toast } from "sonner";

import { friendlyError } from "./friendly-error";
import { clearConfirmedMultiple } from "./focus-confirmation";
import { clearOwner } from "./focus-device";
import { describeEndOutcome } from "./focus-end-outcome";
import { focusEndingStore, focusFailedEndStore, focusOptimisticSessionStore } from "./focus-modal-store";
import { endFocusSession, type EndFocusSessionResult } from "@/app/student/actions";

export const END_ATTEMPT_TIMEOUT_MS = 15_000;
export const END_RETRY_DELAYS_MS = [1_000, 2_000];

export type EndAttemptResult = EndFocusSessionResult & { uncertain?: boolean };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `attempt` is injectable so the retry rules can be tested without a server.
export async function endWithRetry(
  taskId: string,
  creditedSeconds?: number,
  attempt: (taskId: string, creditedSeconds?: number) => Promise<EndFocusSessionResult> = endFocusSession,
  timeoutMs = END_ATTEMPT_TIMEOUT_MS,
  delays: number[] = END_RETRY_DELAYS_MS,
): Promise<EndAttemptResult> {
  let timedOut = false;
  let lastError = "Süren kaydedilemedi.";
  for (let i = 0; i <= delays.length; i++) {
    try {
      const result = await withTimeout(attempt(taskId, creditedSeconds), timeoutMs);
      if (result.ok) {
        // An earlier attempt timed out, so it may well have gone through; finding
        // nothing left to end now means exactly that, not "never started".
        return timedOut && !result.hadSession ? { ...result, uncertain: true } : result;
      }
      lastError = result.error;
    } catch (e) {
      if (e instanceof Error && e.message === "timeout") timedOut = true;
      lastError = friendlyError(e, "Süren kaydedilemedi.");
    }
    if (i < delays.length) await sleep(delays[i]);
  }
  return { ok: false, error: lastError };
}

export function runEndFlow(opts: {
  taskId: string;
  // What the student's own timer showed (or the figure they chose on the check-in).
  clientSeconds: number;
  creditedSeconds?: number;
  goalHit: boolean;
  onSuccess?: () => void;
}) {
  const { taskId, clientSeconds, creditedSeconds, goalHit, onSuccess } = opts;
  focusFailedEndStore.clear(taskId);
  focusEndingStore.begin(taskId);
  const toastId = toast.loading("Süren kaydediliyor…");

  endWithRetry(taskId, creditedSeconds)
    .then((ended) => {
      if (!ended.ok) {
        focusFailedEndStore.set(taskId, creditedSeconds);
        toast.error(
          `${friendlyError(ended.error, "Süren kaydedilemedi.")} Sayaç hâlâ çalışıyor. Sağ alttaki kırmızı karttan ya da buradan tekrar dene.`,
          { id: toastId, duration: Infinity, action: { label: "Tekrar dene", onClick: () => runEndFlow(opts) } },
        );
        return;
      }
      clearConfirmedMultiple(taskId);
      clearOwner(taskId);
      const outcome = describeEndOutcome({
        clientSeconds,
        bankedSeconds: ended.bankedSeconds,
        hadSession: ended.hadSession,
        pendingApproval: ended.pendingApproval,
        uncertain: ended.uncertain,
        goalHit,
      });
      if (!outcome) toast.dismiss(toastId);
      else if (outcome.tone === "warning") toast.warning(outcome.text, { id: toastId, duration: 20_000 });
      else toast.success(outcome.text, { id: toastId });
      onSuccess?.();
    })
    .catch(() => {
      focusFailedEndStore.set(taskId, creditedSeconds);
      toast.error("Süren kaydedilemedi. Sayaç hâlâ çalışıyor; tekrar dene.", {
        id: toastId,
        duration: Infinity,
        action: { label: "Tekrar dene", onClick: () => runEndFlow(opts) },
      });
    })
    .finally(() => {
      focusOptimisticSessionStore.clear(taskId);
      focusEndingStore.end(taskId);
    });
}
