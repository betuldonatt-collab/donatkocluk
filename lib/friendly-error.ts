// What a client component shows when something it called FAILED.
//
// A caught error's `.message` is often not for people: in a production build
// Next.js replaces a thrown Server Action error with "Minified React error
// #441; visit https://react.dev/errors/441 ...", a dropped connection is
// "Failed to fetch", a deploy mid-session is "Failed to find Server Action ...".
// friendlyError() keeps a message that was already written for the user
// (our own Turkish text) and, for anything technical, explains in Turkish what
// most likely went wrong -- never the framework text or a URL.
//
// Use it for every `catch (e)` that puts the error on screen:
//   toast.error(friendlyError(e, "Kaydedilemedi, tekrar dene."));
// The second argument says WHAT failed; the explanation of WHY is added to it.

const TECHNICAL =
  /minified react error|react\.dev\/errors|server components render|failed to find server action|server action .*not found|digest|chunkloaderror|loading chunk|failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|gateway|body exceeded|payload too large|unexpected token|<!doctype|https?:\/\/|\bat\s+\S+\s+\(.*:\d+:\d+\)/i;

type Reason = { test: RegExp; text: string };

// First match wins, so the specific causes come before the catch-all.
const REASONS: Reason[] = [
  {
    test: /failed to fetch|networkerror|load failed|network request failed|fetch failed/i,
    text: "Nedeni: internet bağlantın kesilmiş ya da çok zayıf, istek sunucuya ulaşamadı.",
  },
  {
    test: /timed? ?out|gateway/i,
    text: "Nedeni: sunucu zamanında yanıt vermedi. Kaydın yapılmış olabilir; listeyi kontrol et.",
  },
  {
    test: /failed to find server action|server action .*not found|chunkloaderror|loading chunk/i,
    text: "Nedeni: uygulama yeni bir sürüme güncellendi. Sayfayı yenile (uygulamayı yeniden aç) ve işlemi tekrar yap.",
  },
  {
    test: /body exceeded|payload too large/i,
    text: "Nedeni: gönderilen veri çok büyük (genelde fotoğraf çok büyük olduğunda olur). Daha küçük bir dosya seç.",
  },
];

const DEFAULT_REASON =
  "Nedeni: sunucu işlemi tamamlayamadı ya da sonucu gösterirken bir sorun çıktı. Kaydın yapılmış olabilir; sayfayı yenileyip kontrol et. Sorun sürerse koçuna haber ver.";

export function isTechnicalMessage(message: string): boolean {
  return TECHNICAL.test(message);
}

// Turkish text for a message that is technical (or empty). `what` is the
// call site's own "what failed" sentence ("Kaydedilemedi, tekrar dene.").
export function explainTechnicalMessage(message: string, what: string): string {
  const reason = REASONS.find((r) => r.test.test(message))?.text ?? DEFAULT_REASON;
  const lead = what.trim().replace(/[.!\s]*$/, ".");
  return `${lead} ${reason}`;
}

export function friendlyError(e: unknown, what = "İşlem tamamlanamadı."): string {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!message.trim()) return what;
  return isTechnicalMessage(message) ? explainTechnicalMessage(message, what) : message;
}
