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
const tytCourses = stripPrefix(tytSheetCourses.filter((c) => c.prefix === "tyt"));
const sharedAytGeometri = tytSheetCourses.find((c) => c.prefix === "ayt");
if (!sharedAytGeometri) {
  throw new Error("Expected an AYT Geometri block inside the TYT Kaynak Takibi sheet");
}

function withGeometri(courses) {
  const matIndex = courses.findIndex((c) => /matemat/i.test(c.name));
  const insertAt = matIndex === -1 ? courses.length : matIndex + 1;
  const clone = { ...sharedAytGeometri };
  return [...courses.slice(0, insertAt), clone, ...courses.slice(insertAt)];
}

// ---- AYT per track ----
const aytSayisal = withGeometri(parseKaynakTakibiSheet(sayisalWb.Sheets["AYT Kaynak Takibi"]));
const aytEa = withGeometri(parseKaynakTakibiSheet(eaWb.Sheets["AYT Kaynak Takibi"]));
const aytSozel = [
  ...parseKaynakTakibiSheet(sozelWb.Sheets["AYT SOS 1 Kaynak Takibi"]),
  ...parseKaynakTakibiSheet(sozelWb.Sheets["AYT SOS 2 Kaynak Takibi"]),
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
