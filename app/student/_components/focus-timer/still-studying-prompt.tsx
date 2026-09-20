"use client";

import { useCallback, useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { needsCoachApproval } from "@/lib/focus-approval";
import {
  confirmationMultiple,
  isConfirmationDue,
  readConfirmedMultiple,
  writeConfirmedMultiple,
} from "@/lib/focus-confirmation";

function formatHm(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dakika`;
  return rest === 0 ? `${hours} saat` : `${hours} saat ${rest} dakika`;
}

// Drives the "Hâlâ çalışmaya devam ediyor musun?" prompt for one running
// session. `due` flips true when a 3-hour boundary is crossed that hasn't
// been confirmed; the timer itself is never touched. Only ever mounted
// client-side after a click / after the widget's fetch, so reading
// localStorage in the state initializer can't cause a hydration mismatch.
export function useStillStudyingPrompt(taskId: string, elapsedSeconds: number, active: boolean) {
  const [confirmed, setConfirmed] = useState(() => readConfirmedMultiple(taskId));
  const due = active && isConfirmationDue(elapsedSeconds, confirmed);

  const confirm = useCallback(() => {
    const multiple = confirmationMultiple(elapsedSeconds);
    writeConfirmedMultiple(taskId, multiple);
    setConfirmed(multiple);
  }, [taskId, elapsedSeconds]);

  // (The tab title -- including the "Hâlâ çalışıyor musun?" wording while this
  // is due -- is owned by whichever component shows the running timer, via
  // lib/focus-title.ts, so it can carry the live clock at the same time.)
  return { due, confirm };
}

// The prompt itself. Blocking overlay, but the timer behind it keeps
// counting and keeps being credited whatever the student answers or
// however long they take to answer.
//   "Evet, devam ediyorum" -> keep going seamlessly (asked again in 3h).
//   "Hayır, bitir"         -> ends the session. The student may correct the
//                             figure downwards (e.g. they left their desk);
//                             the default is the full elapsed time.
export function StillStudyingPrompt({
  elapsedSeconds,
  busy,
  onConfirm,
  onEnd,
}: {
  elapsedSeconds: number;
  busy?: boolean;
  onConfirm: () => void;
  // creditedSeconds is undefined when the student keeps the full time.
  onEnd: (creditedSeconds?: number) => void;
}) {
  const fullMinutes = Math.floor(elapsedSeconds / 60);
  const [adjusting, setAdjusting] = useState(false);
  const [minutes, setMinutes] = useState(String(fullMinutes));
  const parsed = Number(minutes);
  const valid = minutes.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= fullMinutes;

  function handleSaveAndEnd() {
    if (!valid) return;
    onEnd(parsed === fullMinutes ? undefined : Math.round(parsed * 60));
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="still-studying-title"
      className="bg-background/85 fixed inset-0 z-[70] flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border p-6 text-center shadow-lg">
        <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
          <BellRing className="text-primary size-7" />
        </div>

        {!adjusting ? (
          <>
            <div className="space-y-1">
              <h2 id="still-studying-title" className="text-foreground text-lg font-semibold">
                Hâlâ çalışmaya devam ediyor musun?
              </h2>
              <p className="text-muted-foreground text-sm">
                Kronometre {formatHm(elapsedSeconds)} süredir çalışıyor. Süren kaybolmadan kaydedilmeye devam ediyor.
              </p>
              {needsCoachApproval(elapsedSeconds) && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  6 saati aşan seanslar sıralamaya ve istatistiklere eklenmeden önce koçunun onayına gönderilir.
                </p>
              )}
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button type="button" size="lg" onClick={onConfirm} disabled={busy}>
                Evet, devam ediyorum
              </Button>
              <Button type="button" variant="outline" onClick={() => setAdjusting(true)} disabled={busy}>
                Hayır, bitir
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 id="still-studying-title" className="text-foreground text-lg font-semibold">
                Ne kadar çalıştın?
              </h2>
              <p className="text-muted-foreground text-sm">
                Kronometre toplam {formatHm(elapsedSeconds)} gösteriyor. Masandan ayrıldıysan süreyi kısaltabilirsin;
                {needsCoachApproval(elapsedSeconds)
                  ? " 6 saati aşan bir süreyi olduğu gibi bırakırsan koçunun onayına gönderilir."
                  : " değiştirmezsen tamamı kaydedilir."}
              </p>
            </div>
            <div className="w-full space-y-1.5 text-left">
              <Label htmlFor="still-studying-minutes">Çalışılan süre (dakika)</Label>
              <Input
                id="still-studying-minutes"
                type="number"
                min={0}
                max={fullMinutes}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                aria-invalid={!valid || undefined}
                className="bg-background"
              />
              {!valid && (
                <p className="text-destructive text-xs">0 ile {fullMinutes} arasında bir dakika değeri gir.</p>
              )}
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button type="button" size="lg" onClick={handleSaveAndEnd} disabled={busy || !valid}>
                Kaydet ve bitir
              </Button>
              <Button type="button" variant="outline" onClick={() => setAdjusting(false)} disabled={busy}>
                Geri dön
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
