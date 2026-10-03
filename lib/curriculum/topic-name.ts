// The Maarif curriculum JSON keeps its sheet numbering ("4.4. Dil Bilgisi ›
// Sıfatlar", "1.6. Sınıflandırma › 1.6.1. Domain Sistemi") so the hierarchy
// and ordering stay readable in the data -- but no student or coach should
// ever see those markers. Stripped once, where the Maarif data is loaded
// (maarif9.ts / maarif10.ts), so every screen shows clean names.
//
// Deeper headings are merged into one name with " › ", and each segment can
// carry its own prefix, so each is stripped. Deliberately NOT applied to
// TYT/AYT/LGS data: their topics legitimately start with numbers ("2.
// Dereceden Denklemler", "20. Yüzyıl Başlarında ...").
const LEADING_NUMBER = /^\d+(?:\.\d+)*\.\s+/;

export function stripTopicNumberPrefix(name: string): string {
  return name
    .split(" › ")
    .map((segment) => segment.replace(LEADING_NUMBER, ""))
    .join(" › ");
}

// LGS's Konu labels ("1.1 Çarpanlar ve Katlar") carry the same kind of sheet
// numbering, but without a trailing dot. Only ever applied to a Unit's
// `konu` field: LGS unit labels ("1. ÜNİTE") are real identifiers and a
// topic like "2. Dünya savaşı ve demokrasi yolunda atılan adımlar" starts
// with a genuine number, so neither is touched.
export function stripKonuNumberPrefix(konu: string): string {
  return konu.replace(/^\d+(?:\.\d+)+\.?\s+/, "");
}

// Short Turkish connector words that stay lowercase in Title Case unless
// they open the string -- "ve" in "Mevsimler ve İklim" reads odd as "Ve".
const TR_TITLE_CASE_LOWERCASE_WORDS = new Set(["ve", "ile", "de", "da", "mı", "mi", "mu", "mü", "ya", "veya", "ki"]);

// Turkish-correct Title Case ("1. ÜNİTE: MEVSİMLER VE İKLİM" -> "1. Ünite:
// Mevsimler ve İklim"). Plain JS .toUpperCase()/.toLowerCase() get
// Turkish's dotted/dotless İ/I/ı/i wrong (English lowercases "I" to "i",
// Turkish needs "ı") -- always .toLocaleLowerCase/.toLocaleUpperCase("tr-TR")
// instead. Curriculum text (lib/curriculum/lgs.json) mixes real ALL CAPS
// unit headings with topic names that already read fine in mixed case, so
// this is applied only where a caller has confirmed the raw text is
// shouting (see lgs-selection.ts), not blanket over every string.
//
// Splits on whitespace and recases each token independently, so internal
// punctuation (":", "()", "1.") rides along unchanged: a token starting
// with a digit ("10'un") is left as the lowercase pass produced it --
// capitalizing a grammatical suffix after a number would be wrong -- and
// every other token gets its first LETTER (wherever punctuation like "("
// puts it) capitalized, unless it's a short connector word and not the
// string's first word.
export function toTurkishTitleCase(s: string): string {
  const lower = s.toLocaleLowerCase("tr-TR");
  let seenWord = false;
  return lower
    .split(" ")
    .map((token) => {
      if (/^\d/.test(token)) return token;
      const letterIndex = token.search(/\p{L}/u);
      if (letterIndex === -1) return token;
      const isFirstWord = !seenWord;
      seenWord = true;
      const bareWord = token.replace(/[^\p{L}]/gu, "");
      if (!isFirstWord && TR_TITLE_CASE_LOWERCASE_WORDS.has(bareWord)) return token;
      return token.slice(0, letterIndex) + token.charAt(letterIndex).toLocaleUpperCase("tr-TR") + token.slice(letterIndex + 1);
    })
    .join(" ");
}

const isAllUpper = (s: string) => s === s.toLocaleUpperCase("tr-TR") && s !== s.toLocaleLowerCase("tr-TR");

// Maarif unit labels arrive in several shapes ("TEMA 1: SÖZÜN İNCELİĞİ",
// "1.ÜNİTE: COĞRAFYANIN DOĞASI", "3. TEMA: GEOMETRİK ŞEKİLLER", "THEME 4",
// "1. Ünite: Sözün Ezgisi"). Every one reads as "N. Ünite: Title" / "N. Tema:
// Title" in Title Case on screen, like the 10th grade's -- an ALL-CAPS title
// is Title Cased, a title already in mixed case is left alone (apart from a
// stray capital "Ve"). Idempotent, so already-clean labels pass through.
const UNIT_LABEL = /^(?:(\d+)\.\s*(ÜNİTE|Ünite|TEMA|Tema)|(ÜNİTE|Ünite|TEMA|Tema)\s+(\d+))(?=\s|:|$)\s*:?\s*(.*)$/;

export function normalizeUnitLabel(label: string): string {
  const text = label.replace(/\s+/g, " ").trim();
  const m = UNIT_LABEL.exec(text);
  if (!m) return isAllUpper(text) ? toTurkishTitleCase(text) : text;
  const number = m[1] ?? m[4];
  const word = (m[2] ?? m[3]).toLocaleLowerCase("tr-TR").startsWith("ü") ? "Ünite" : "Tema";
  const rest = m[5].trim();
  const title = isAllUpper(rest) ? toTurkishTitleCase(rest) : rest.replace(/ Ve /g, " ve ");
  return `${number}. ${word}${title ? `: ${title}` : ""}`;
}

// Cleans a Maarif course list for display: topic names lose the sheet's
// hierarchy numbers, unit labels are normalised (see above). The raw JSON
// keeps both untouched.
export function withCleanNames<U extends { unit: string | null; topics: { name: string }[] }, C extends { units: U[] }>(courses: C[]): C[] {
  return courses.map(
    (course) =>
      ({
        ...course,
        units: course.units.map((unit) => ({
          ...unit,
          unit: unit.unit === null ? null : normalizeUnitLabel(unit.unit),
          topics: unit.topics.map((topic) => ({ ...topic, name: stripTopicNumberPrefix(topic.name) })),
        })),
      }) as C,
  );
}
