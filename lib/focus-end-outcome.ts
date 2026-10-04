// What the student is told after Bitir, worked out from what the SERVER really
// banked -- never just from what their own timer showed. The server is the
// source of truth for credited time; when the phone's clock and the server
// disagree (the start/resume request reached the server late because the
// phone was locked or the app was backgrounded right after the tap), the
// student is told exactly that, so they learn to keep the app open for a
// moment after pressing Başlat / Devam Et.
import { resolvePraiseMessage } from "./focus-praise";
import { formatTimerClock } from "./focus-title";

// A shortfall under this is clock rounding / network latency, not a problem.
export const SHORTFALL_WARNING_SECONDS = 60;

export type EndOutcomeInput = {
  // What the student's own timer showed (or the figure they chose on the
  // "still studying?" check-in).
  clientSeconds: number;
  // What the server actually credited.
  bankedSeconds: number;
  // False when the server had no session to end (ended from another device, or
  // the start request never reached it).
  hadSession: boolean;
  pendingApproval: boolean;
  // A retry found nothing left to end after an earlier attempt timed out, so the
  // first attempt most likely went through but its figures never came back.
  uncertain?: boolean;
  goalHit: boolean;
};

export type EndOutcome = { tone: "success" | "warning"; text: string } | null;

export function describeEndOutcome(input: EndOutcomeInput): EndOutcome {
  const { clientSeconds, bankedSeconds, hadSession, pendingApproval, uncertain, goalHit } = input;

  if (pendingApproval) {
    return { tone: "warning", text: `${formatTimerClock(clientSeconds)} çok uzun olduğu için koç onayına gönderildi.` };
  }

  if (!hadSession) {
    if (uncertain) return { tone: "success", text: "Süren kaydedildi." };
    if (clientSeconds < 30) return null;
    return {
      tone: "warning",
      text:
        "Bu sayaç sunucuda bulunamadı. Ya başka bir cihazdan bitirildi ve süren orada kaydedildi, ya da Başlat'a bastıktan hemen sonra ekranı kilitlediğin veya uygulamayı arka plana attığın için başlatma isteği sunucuya hiç ulaşmadı; bu durumda süre kaydedilemedi. Süre Tut'u açıp görevdeki son süreyi kontrol et.",
    };
  }

  if (clientSeconds - bankedSeconds >= SHORTFALL_WARNING_SECONDS) {
    return {
      tone: "warning",
      text:
        `Süren eksik kaydedildi: sayaç ${formatTimerClock(clientSeconds)} gösteriyordu, ${formatTimerClock(bankedSeconds)} kaydedildi. ` +
        "Bunun nedeni büyük olasılıkla Başlat veya Devam Et'e bastıktan hemen sonra ekranı kilitlemen ya da uygulamayı arka plana atman: internet bağlantısı koptu ve işlem sunucuya geç ulaştı. " +
        "Başlat veya Devam Et'e bastıktan sonra uygulamayı bir iki saniye açık tut.",
    };
  }

  if (bankedSeconds > 0) {
    return {
      tone: "success",
      text: `${resolvePraiseMessage(bankedSeconds, goalHit)} ${formatTimerClock(bankedSeconds)} boyunca odaklandın, göreve kaydedildi.`,
    };
  }
  return null;
}
