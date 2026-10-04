"use client";

import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OTHER_DEVICE_QUESTION } from "@/lib/focus-device";
import { formatTimerClock } from "@/lib/focus-title";

// "Farklı bir cihazda devam eden bir süreniz var, durdurmak ister misiniz?"
// Shown when a RUNNING session exists on the server that this browser did not
// start (another phone / tablet / browser). Nothing is decided for the student:
//   "Durdur ve kaydet"        -> ends it and banks the time (ordinary Bitir);
//   "Çalışmaya devam etsin"   -> leaves it running, untouched.
// Same overlay look as the "still studying?" check-in.
export function OtherDeviceSessionPrompt({
  taskTitle,
  elapsedSeconds,
  onStop,
  onKeep,
}: {
  taskTitle: string;
  elapsedSeconds: number;
  onStop: () => void;
  onKeep: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="other-device-title"
      className="bg-background/85 fixed inset-0 z-[70] flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border p-6 text-center shadow-lg">
        <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
          <Smartphone className="text-primary size-7" />
        </div>
        <div className="space-y-1">
          <h2 id="other-device-title" className="text-foreground text-lg font-semibold">
            {OTHER_DEVICE_QUESTION}
          </h2>
          <p className="text-muted-foreground text-sm">
            “{taskTitle}” için sayaç şu an {formatTimerClock(elapsedSeconds)} gösteriyor ve çalışmaya devam ediyor.
            Durdurursan o ana kadarki süren göreve kaydedilir.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button type="button" size="lg" onClick={onStop}>
            Durdur ve kaydet
          </Button>
          <Button type="button" variant="outline" onClick={onKeep}>
            Çalışmaya devam etsin
          </Button>
        </div>
      </div>
    </div>
  );
}
