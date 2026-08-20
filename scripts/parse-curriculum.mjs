// Parses the three "Taslak Dosyası" workbooks into lib/curriculum/*.json.
//
// Each *Kaynak Takibi sheet packs every course into ONE sheet as sequential
// row-blocks (not one course per sheet): a course-header row ("TYT TÜRKÇE"),
// then a "Konu Çalışması" sub-header row, then topic rows where column A is
// the unit (blank on continuation rows — a manual rowspan) and column B is
// the topic, plus 8 trailing year columns of historical question counts.
// This walks that structure directly rather than assuming fixed row ranges,
// since block lengths vary per course.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "lib", "curriculum");
const SOURCE_DIR = path.join(ROOT, "supabase", "curriculum-source");

const TR_MAP = {
  ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", I: "I", İ: "i", ö: "o", Ö: "O",
  ş: "s", Ş: "S", ü: "u", Ü: "U",
};

function slugify(name) {
  const ascii = name
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cell(row, i) {
  const v = row[i];
  return v === undefined || v === null ? "" : String(v).trim();
}

function isCourseHeader(row) {
  const a = cell(row, 0);
  const b = cell(row, 1);
  return /^(TYT|AYT)\s/.test(a) || /^(TYT|AYT)\s/.test(b);
}

function courseHeaderName(row) {
  const a = cell(row, 0);
  return /^(TYT|AYT)\s/.test(a) ? a : cell(row, 1);
}

// Column positions are NOT uniform across course blocks — some courses were
// set up with 3 resource slots, others (e.g. Coğrafya) with only 2, which
// shifts every column after it (topic column, checkbox columns, year
// columns). Rather than trust fixed indices, each row is read structurally:
// find where its TRUE/FALSE checkbox block starts, treat everything before
// that as "label" cells (unit/topic), and locate year columns by scanning
// the course's own header row for "TYT 2025" / "AYT 2025" style labels.
function findCheckboxStart(row) {
  for (let i = 0; i < row.length; i++) {
    const v = cell(row, i).toUpperCase();
    if (v === "TRUE" || v === "FALSE") return i;
  }
  return -1;
}

function findYearColumns(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const m = /^(?:TYT|AYT)\s+(20\d\d)$/i.exec(cell(headerRow, i));
    if (m) map[Number(m[1])] = i;
  }
  return map;
}

// Parses one *Kaynak Takibi sheet into a list of { id, name, units, prefix }.
// `prefix` is "tyt" or "ayt", derived from the header text itself.
function parseKaynakTakibiSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const courses = [];
  let current = null;
  let currentUnit = null;
  let yearCols = {};

  function flushCourse() {
    if (current) courses.push(current);
    current = null;
    currentUnit = null;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isCourseHeader(row)) {
      flushCourse();
      const header = courseHeaderName(row);
      const m = /^(TYT|AYT)\s+(.+)$/i.exec(header);
      const prefix = (m ? m[1] : "AYT").toLowerCase();
      const displayName = m ? toTitleCaseTr(m[2]) : header;
      current = { id: `${prefix}-${slugify(displayName)}`, name: displayName, units: [], prefix };
      yearCols = findYearColumns(row);
      continue;
    }
    if (!current) continue;

    const checkboxStart = findCheckboxStart(row);
    if (checkboxStart <= 0) continue; // sub-header / blank / spacer rows

    const labelCells = [];
    for (let c = 0; c < checkboxStart; c++) {
      const v = cell(row, c);
      if (v) labelCells.push(v);
    }
    if (labelCells.length === 0) continue;

    let unitCell = null;
    let topicCell;
    if (labelCells.length === 1) {
      topicCell = labelCells[0];
    } else {
      unitCell = labelCells[0];
      topicCell = labelCells[labelCells.length - 1];
    }

    if (unitCell) {
      currentUnit = { unit: unitCell, topics: [] };
      current.units.push(currentUnit);
    }
    if (!currentUnit) {
      currentUnit = { unit: "-", topics: [] };
      current.units.push(currentUnit);
    }

    const topicIndex = currentUnit.topics.length;
    const topic = {
      id: `${current.id}-u${current.units.length - 1}-t${topicIndex}`,
      name: topicCell,
    };

    const freq = {};
    for (const [year, colIndex] of Object.entries(yearCols)) {
      const raw = cell(row, colIndex);
      if (raw !== "" && !Number.isNaN(Number(raw))) freq[year] = Number(raw);
    }
    if (Object.keys(freq).length > 0) topic.frequency = freq;

    currentUnit.topics.push(topic);
  }
  flushCourse();
  // Drop section-divider rows that match the course-header pattern but have
  // no topics under them (e.g. "AYT FELSEFE GRUBU", a label immediately
  // followed by the 4 real courses it groups — Felsefe/Psikoloji/Sosyoloji/
  // Mantık — each already captured as its own course block).
  return courses.filter((c) => c.units.some((u) => u.topics.length > 0));
}

function toTitleCaseTr(s) {
  // Source headers are ALL CAPS ("TÜRKÇE", "MANTIK"). Plain JS toLowerCase()
  // maps ASCII "I" -> "i", but in Turkish upper-case text "I" (no dot) is
  // the capital of "ı" (dotless) — "MANTIK" is "mantık", not "mantik".
  // toLocaleLowerCase("tr") applies that mapping correctly.
  const lower = s.toLocaleLowerCase("tr");
  return lower.replace(/(^|\s|-)\S/g, (m) => m.toLocaleUpperCase("tr"));
}

// De-duplicate course ids that collide across AYT tracks (e.g. "Geometri"
// appears, identically, in both the Sayısal and Eşit Ağırlık AYT sheets) by
// suffixing every occurrence with its track once a collision is detected —
// state in the app is keyed by course id across track switches, so reused
// ids would cross-contaminate two tracks' progress.
function disambiguateAcrossTracks(trackCourseLists) {
  const idCounts = new Map();
  for (const courses of Object.values(trackCourseLists)) {
    for (const c of courses) idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1);
  }
  for (const [track, courses] of Object.entries(trackCourseLists)) {
    for (const c of courses) {
      if (idCounts.get(c.id) > 1) c.id = `${c.id}-${track}`;
    }
  }
  return trackCourseLists;
}

function stripPrefix(courses) {
  return courses.map(({ id, name, units }) => ({ id, name, units }));
}

// The source sheets only mark a unit's name on its first row and leave the
// column blank on every continuation row (a manual rowspan) — which is
// genuinely ambiguous where a *second*, unrelated block of topics follows
// with no unit name of its own: nothing in the row data distinguishes
// "still part of the named unit above" from "an unnamed block that just
// happens to come next". A handful of spots parse as one oversized unit
// as a result. These boundaries were confirmed against the previously
// hand-verified course data, so they're corrected explicitly here rather
// than guessed at structurally.
function splitUnitAt(course, unitName, splitIndex) {
  const idx = course.units.findIndex((u) => u.unit === unitName);
  if (idx === -1) throw new Error(`splitUnitAt: no unit "${unitName}" in ${course.id}`);
  const unit = course.units[idx];
  if (unit.topics.length <= splitIndex) return; // already short enough — no-op
  const head = { unit: unit.unit, topics: unit.topics.slice(0, splitIndex) };
  const tail = { unit: "-", topics: unit.topics.slice(splitIndex) };
  course.units.splice(idx, 1, head, tail);
  // Topic ids encode their unit index (u{ui}-t{ti}); renumber every unit
  // from here on so ids stay internally consistent after the split.
  course.units = course.units.map((u, ui) => ({
    unit: u.unit,
    topics: u.topics.map((t, ti) => ({ ...t, id: `${course.id}-u${ui}-t${ti}` })),
  }));
}

// Every boundary below was hand-verified against the source workbooks and
// given as an explicit ground-truth mapping — not re-derived structurally.
const UNIT_SPLIT_CORRECTIONS = {
  "tyt-turkce": [
    ["Anlam Bilgisi", 3],
    ["Fiiller", 5],
  ],
  "tyt-matematik": [["Problemler", 8]],
  "ayt-matematik": [["Trigonometri", 4]],
  "ayt-geometri": [["Analitik Geometri", 2]],
  "ayt-fizik": [["Çembersel Hareket", 4]],
  "ayt-kimya": [["Modern Atom Teorisi", 3]],
  "ayt-biyoloji": [
    ["İnsan Fizyolojisi", 9],
    ["Bitki Biyolojisi", 3],
  ],
  "ayt-edebiyat": [
    ["Divan Edebiyatı", 4],
    ["Cumhuriyet Romanı", 4],
  ],
  "ayt-tarih-1": [
    ["Beylikten Devlete Osmanlı Siyaseti", 2],
    ["Uluslararası İlişkilerde Denge Stratejisi", 2],
    ["İki Savaş Arası Dönemde Türkiye ve Dünya", 1],
  ],
};

// A unit that just carries the wrong name (no boundary problem) — the
// source's actual label for this 10-topic poetry cluster is "Cumhuriyet
// Şiiri"; the parser picked up "Cumhuriyet Edebiyatı" instead.
const UNIT_RENAME_CORRECTIONS = {
  "ayt-edebiyat": [["Cumhuriyet Edebiyatı", "Cumhuriyet Şiiri"]],
};

function renameUnit(course, oldName, newName) {
  const unit = course.units.find((u) => u.unit === oldName);
  if (!unit) throw new Error(`renameUnit: no unit "${oldName}" in ${course.id}`);
  unit.unit = newName;
}

function applyUnitSplitCorrections(course) {
  for (const [unitName, splitIndex] of UNIT_SPLIT_CORRECTIONS[course.id] ?? []) {
    splitUnitAt(course, unitName, splitIndex);
  }
  for (const [oldName, newName] of UNIT_RENAME_CORRECTIONS[course.id] ?? []) {
    renameUnit(course, oldName, newName);
  }
  return course;
}

// Frequency-only patch — orthogonal to the unit/grouping corrections above
// and must stay that way: this never adds, removes, renames, or reorders a
// unit or topic, it only fills in the per-year question-count numbers for
// topics that already exist. These four courses (AYT Felsefe/Psikoloji/
// Sosyoloji/Mantık — the "AYT Felsefe Grubu" section of the Sözel sheet)
// sit in a part of the source sheet where the year-column header detection
// found nothing, so every topic parsed with no frequency at all. Values
// below were hand-transcribed from the source workbook and are given in
// PAST_QUESTION_YEARS order: [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].
const OVERRIDE_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

const FREQUENCY_OVERRIDES = {
  "ayt-felsefe": {
    "Felsefeyi Tanıma": [1, 1, 1, 2, 0, 0, 1, 0],
    "Felsefe ile Düşünme": [0, 1, 0, 0, 0, 0, 0, 0],
    "Varlık Felsefesi": [0, 0, 0, 0, 0, 0, 0, 0],
    "Bilgi Felsefesi": [0, 1, 0, 1, 1, 0, 1, 0],
    "Bilim Felsefesi": [0, 0, 0, 0, 0, 0, 0, 1],
    "Ahlak Felsefesi": [0, 0, 0, 0, 0, 0, 0, 0],
    "Din Felsefesi": [0, 1, 0, 0, 0, 0, 0, 0],
    "Siyaset Felsefesi": [0, 0, 1, 0, 0, 0, 1, 0],
    "Sanat Felsefesi": [1, 1, 0, 0, 0, 0, 1, 1],
    "Felsefi Okuma ve Yazma": [0, 0, 1, 0, 0, 0, 0, 0],
  },
  "ayt-psikoloji": {
    "Psikoloji Bilimini Tanıyalım": [1, 1, 1, 2, 1, 2, 1, 1],
    "Psikolojinin Temel Süreçleri": [1, 1, 2, 1, 1, 2, 1, 1],
    "Öğrenme, Bellek, Düşünme": [1, 1, 0, 1, 1, 0, 1, 1],
    "Ruh Sağlığının Temelleri": [1, 1, 1, 1, 0, 0, 1, 1],
  },
  "ayt-sosyoloji": {
    "Sosyolojiye Giriş": [1, 2, 1, 1, 1, 0, 1, 0],
    "Birey ve Toplum": [1, 2, 2, 1, 1, 1, 3, 1],
    "Toplumsal Yapı": [1, 0, 1, 0, 0, 2, 0, 1],
    "Toplumsal Değişme ve Gelişme": [1, 1, 1, 1, 2, 1, 0, 1],
    "Toplum ve Kültür": [0, 0, 0, 1, 1, 0, 0, 1],
    "Toplumsal Kurumlar": [1, 0, 0, 1, 0, 1, 1, 1],
  },
  "ayt-mantik": {
    "Mantığa Giriş": [1, 1, 2, 1, 1, 2, 2, 2],
    "Klasik Mantık": [1, 2, 2, 1, 1, 2, 0, 1],
    "Mantık ve Dil": [1, 0, 0, 0, 1, 0, 0, 0],
    "Sembolik Mantık": [1, 1, 0, 2, 1, 0, 2, 1],
  },
};

function applyFrequencyOverrides(course) {
  const overrides = FREQUENCY_OVERRIDES[course.id];
  if (!overrides) return course;

  const remaining = new Set(Object.keys(overrides));
  for (const unit of course.units) {
    for (const topic of unit.topics) {
      const values = overrides[topic.name];
      if (!values) continue;
      remaining.delete(topic.name);
      topic.frequency = Object.fromEntries(OVERRIDE_YEARS.map((year, i) => [year, values[i]]));
    }
  }
  if (remaining.size > 0) {
    throw new Error(
      `applyFrequencyOverrides: ${course.id} has no topic matching: ${[...remaining].join(", ")}`,
    );
  }
  return course;
}

// Regenerates topic ids from a course's own id so a clone (see below) gets
// ids namespaced to itself instead of reusing the source course's ids.
function withId(course, id) {
  return {
    ...course,
    id,
    units: course.units.map((u, ui) => ({
      unit: u.unit,
      topics: u.topics.map((t, ti) => ({ ...t, id: `${id}-u${ui}-t${ti}` })),
    })),
  };
}

function loadWorkbook(filename) {
  // Falls back to the repo root for a file that hasn't been moved into
  // supabase/curriculum-source/ yet (e.g. still open elsewhere and locked).
  const preferred = path.join(SOURCE_DIR, filename);
  const fallback = path.join(ROOT, filename);
  try {
    return XLSX.readFile(preferred);
  } catch {
    return XLSX.readFile(fallback);
  }
}

// ---- TYT (identical across all three files — parse once, from Sayısal) ----
const sayisalWb = loadWorkbook("Mezun Sayısal - Taslak Dosyası (1).xlsx");
const eaWb = loadWorkbook("Mezun Eşit Ağırlık - Taslak Dosyası.xlsx");
const sozelWb = loadWorkbook("Mezun Sözel - Taslak Dosyası.xlsx");

// The "TYT Kaynak Takibi" sheet contains two blocks — "TYT GEOMETRİ" and,
// immediately after it, "AYT GEOMETRİ": Geometri is taught as one combined
// TYT+AYT subject, and its AYT-level topic list is defined only here, once
// — neither AYT Kaynak Takibi sheet (Sayısal or EA) repeats it. It applies
// to both tracks, so it's cloned into each below rather than parsed twice.
const tytSheetCourses = parseKaynakTakibiSheet(sayisalWb.Sheets["TYT Kaynak Takibi"]);
const tytCourses = stripPrefix(tytSheetCourses.filter((c) => c.prefix === "tyt")).map(
  applyUnitSplitCorrections,
);
const sharedAytGeometriRaw = tytSheetCourses.find((c) => c.prefix === "ayt");
if (!sharedAytGeometriRaw) {
  throw new Error("Expected an AYT Geometri block inside the TYT Kaynak Takibi sheet");
}
const sharedAytGeometri = applyUnitSplitCorrections(sharedAytGeometriRaw);

function withGeometri(courses) {
  const matIndex = courses.findIndex((c) => /matemat/i.test(c.name));
  const insertAt = matIndex === -1 ? courses.length : matIndex + 1;
  const clone = { ...sharedAytGeometri };
  return [...courses.slice(0, insertAt), clone, ...courses.slice(insertAt)];
}

// ---- AYT per track ----
const aytSayisal = withGeometri(
  parseKaynakTakibiSheet(sayisalWb.Sheets["AYT Kaynak Takibi"]).map(applyUnitSplitCorrections),
);
const aytEa = withGeometri(
  parseKaynakTakibiSheet(eaWb.Sheets["AYT Kaynak Takibi"]).map(applyUnitSplitCorrections),
);
const aytSozel = [
  ...parseKaynakTakibiSheet(sozelWb.Sheets["AYT SOS 1 Kaynak Takibi"]).map(applyUnitSplitCorrections),
  ...parseKaynakTakibiSheet(sozelWb.Sheets["AYT SOS 2 Kaynak Takibi"])
    .map(applyUnitSplitCorrections)
    .map(applyFrequencyOverrides),
];

const trackCourseLists = disambiguateAcrossTracks({
  sayisal: aytSayisal,
  ea: aytEa,
  sozel: aytSozel,
});

// disambiguateAcrossTracks only renamed the *id*; give each track's cloned
// Geometri its own topic ids too so progress-tracking keys never collide.
for (const [track, courses] of Object.entries(trackCourseLists)) {
  trackCourseLists[track] = courses.map((c) =>
    c.name === sharedAytGeometri.name ? withId(c, c.id) : c,
  );
}

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(path.join(OUT_DIR, "tyt.json"), JSON.stringify(tytCourses, null, 2) + "\n");
writeFileSync(
  path.join(OUT_DIR, "ayt-sayisal.json"),
  JSON.stringify(stripPrefix(trackCourseLists.sayisal), null, 2) + "\n",
);
writeFileSync(
  path.join(OUT_DIR, "ayt-ea.json"),
  JSON.stringify(stripPrefix(trackCourseLists.ea), null, 2) + "\n",
);
writeFileSync(
  path.join(OUT_DIR, "ayt-sozel.json"),
  JSON.stringify(stripPrefix(trackCourseLists.sozel), null, 2) + "\n",
);

console.log("TYT courses:", tytCourses.map((c) => c.id).join(", "));
console.log("AYT sayısal:", trackCourseLists.sayisal.map((c) => c.id).join(", "));
console.log("AYT ea:", trackCourseLists.ea.map((c) => c.id).join(", "));
console.log("AYT sözel:", trackCourseLists.sozel.map((c) => c.id).join(", "));

const totalTopics = (courses) =>
  courses.reduce((n, c) => n + c.units.reduce((m, u) => m + u.topics.length, 0), 0);

console.log("\nTopic counts — tyt:", totalTopics(tytCourses),
  "ayt-sayisal:", totalTopics(trackCourseLists.sayisal),
  "ayt-ea:", totalTopics(trackCourseLists.ea),
  "ayt-sozel:", totalTopics(trackCourseLists.sozel));

console.log("\nWrote lib/curriculum/*.json");
