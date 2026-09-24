// Clones the 10th-grade ("Türkiye Yüzyılı Maarif Modeli") curriculum from
// supabase/curriculum-source/"10. Sınıf - Taslak Dosyası.xlsx" into
//   lib/curriculum/maarif10.json               (from "10. Sınıf Kaynak Takibi")
//   lib/curriculum/maarif10-genel-deneme.json  (from "10. Sınıf Genel Deneme Analizi")
//
// Same rules as scripts/parse-maarif9-curriculum.mjs (Subject -> Unit -> Topic,
// deeper headings merged into the topic name with " › ", Title Case subject
// names, whitespace/casing normalised, obvious typos fixed and printed for
// review). Pure data extraction: nothing here is wired into the app, and no
// topic/unit/subject is invented -- every string comes from a cell.
//
// Differences from the 9th-grade workbook that this script handles:
//   - Subject headers carry no "10. Sınıf" prefix (it is added), and the Kimya
//     header has no "Ünite Bilgisi" label (its name sits in that cell).
//   - Türk Dili ve Edebiyatı is listed twice in Kaynak Takibi (rows 1 and 147);
//     the copies must be identical and are merged into one subject.
//   - A cell is a UNIT only when it sits in the unit column and reads
//     "N. Ünite ..."; İngilizce's "Theme N" rows and the Genel Deneme's
//     Coğrafya/Din/Felsefe items sit in the topic columns and are topics with
//     unit = null.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "supabase", "curriculum-source", "10. Sınıf - Taslak Dosyası.xlsx");
const OUT_DIR = path.join(ROOT, "lib", "curriculum");

const SEP = " › ";
const TR_MAP = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", I: "I", İ: "i", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
const slugify = (s) =>
  s.split("").map((ch) => TR_MAP[ch] ?? ch).join("").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Whole-cell replacements, matched AFTER whitespace normalisation.
const TYPO_FIXES = new Map([
  ["2.2. Ekolojik Sürürülebilirlik", "2.2. Ekolojik Sürdürülebilirlik"],
  ["Theme 3: Personel Life & Well - Being", "Theme 3: Personal Life & Well-Being"],
  ["Allah - Alem İlişkisi (Yaratılış ve Evdendeki Düzen)", "Allah - Alem İlişkisi (Yaratılış ve Evrendeki Düzen)"],
  ["Ameli-Fıkhi Yorumla", "Ameli-Fıkhi Yorumlar"],
  ["İslam' da Bilgi ve Bilginin Kaynakları", "İslam'da Bilgi ve Bilginin Kaynakları"],
]);
const applied = [];
const seen = new Set();
function note(kind, from, to) {
  const key = `${kind}|${from}`;
  if (seen.has(key)) return;
  seen.add(key);
  applied.push({ kind, from, to });
}

// "1.Ünite:", "1. Ünite :", "1. ÜNİTE" -> "1. Ünite: ..." ; a unit with no name stays "N. Ünite".
function normaliseUnitLabel(s) {
  const m = /^(\d+)\.\s*ünite\s*:?\s*(.*)$/i.exec(s);
  if (!m) return s;
  const rest = m[2].trim();
  return rest ? `${m[1]}. Ünite: ${rest}` : `${m[1]}. Ünite`;
}

function clean(raw) {
  const original = String(raw ?? "").trim();
  const s = original.replace(/-\s*\n\s*/g, "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  if (/\n/.test(original)) note("line-break", original.replace(/\r?\n/g, "⏎"), s);
  const fixed = TYPO_FIXES.get(s);
  if (fixed) {
    note("typo", s, fixed);
    return fixed;
  }
  return s;
}

function titleCaseTr(s) {
  return s
    .replace(/:/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w) || w === "Sınıf") return w;
      const lower = w.toLocaleLowerCase("tr");
      if (lower === "ve") return "ve";
      return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
}

const isBool = (s) => /^(TRUE|FALSE)$/i.test(s);
const UNIT_LABEL = /^\d+\.\s*Ünite\b/i;

function buildTree(rowsCells) {
  const root = { text: "", col: -1, children: [] };
  const stack = [root];
  for (const cells of rowsCells) {
    for (const c of cells) {
      while (stack.length > 1 && stack[stack.length - 1].col >= c.col) stack.pop();
      const node = { text: c.text, col: c.col, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
  }
  return root;
}

function leafPaths(node) {
  if (node.children.length === 0) return [node.text];
  return node.children.flatMap((ch) => leafPaths(ch).map((p) => `${node.text}${SEP}${p}`));
}

// A level-1 node is a unit only if it sits in the unit column (baseCol) AND
// reads "N. Ünite ..."; anything else at level 1 is a topic (unit = null).
function toUnits(subjectNode, baseCol) {
  const units = [];
  let loose = null;
  for (const n of subjectNode.children) {
    if (n.col === baseCol && UNIT_LABEL.test(n.text)) {
      const label = normaliseUnitLabel(n.text);
      if (label !== n.text) note("unit-label", n.text, label);
      loose = null;
      units.push({ unit: label, topics: n.children.flatMap(leafPaths) });
    } else {
      if (!loose) {
        loose = { unit: null, topics: [] };
        units.push(loose);
      }
      loose.topics.push(...leafPaths(n));
    }
  }
  return units;
}

const withIds = (prefix, units) =>
  units.map((u, ui) => ({ unit: u.unit, topics: u.topics.map((name, ti) => ({ id: `${prefix}-u${ui}-t${ti}`, name })) }));

const wb = XLSX.readFile(SOURCE);
const sheetRows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });

// ---- Kaynak Takibi: three side-by-side column blocks (0, 14, 28). A course
// starts at a row whose "Okul İlerlemesi" header sits 4 columns after the block
// start; its name is the cell after "Ünite Bilgisi" (or the cell itself when
// that label is missing -- Kimya).
function parseKaynakTakibi() {
  const rows = sheetRows("10. Sınıf Kaynak Takibi");
  const byId = new Map();
  const order = [];
  const anomalies = [];
  for (const c of [0, 14, 28]) {
    let current = null;
    const flush = () => {
      if (!current) return;
      const subject = titleCaseTr(current.rawName);
      const id = `maarif10-${slugify(subject)}`;
      const course = { id, name: `10. Sınıf ${subject}`, units: withIds(id, toUnits(buildTree(current.cells), 0)) };
      if (byId.has(id)) {
        const same = JSON.stringify(byId.get(id)) === JSON.stringify(course);
        anomalies.push(`${course.name}: listed again at row ${current.row} -- ${same ? "identical copy, merged" : "DIFFERENT copy (kept the first)"}`);
        if (!same) throw new Error(`${course.name} appears twice with different content`);
      } else {
        byId.set(id, course);
        order.push(id);
      }
      current = null;
    };
    rows.forEach((row, rowIndex) => {
      const cell = (i) => clean(row[i]);
      if (cell(c + 4) === "Okul İlerlemesi") {
        flush();
        const labelled = cell(c) === "Ünite Bilgisi";
        if (!labelled) anomalies.push(`row ${rowIndex + 1}: header without "Ünite Bilgisi" label, name read from the label cell: ${cell(c)}`);
        current = { rawName: labelled ? cell(c + 1) : cell(c), cells: [], row: rowIndex + 1 };
        return;
      }
      if (!current) return;
      const cells = [];
      for (let j = c; j <= c + 3; j++) {
        const t = cell(j);
        if (t && !isBool(t)) cells.push({ col: j - c, text: t });
      }
      if (cells.length === 0) return;
      current.cells.push(cells);
    });
    flush();
  }
  return { courses: order.map((id) => byId.get(id)), anomalies };
}

// ---- Genel Deneme Analizi: col0 = group (first subject of each group), col1..4
// = labels; a subject row carries "1. DENEME" in col6 (col5 in the 9th-grade workbook).
function parseGenelDeneme() {
  const rows = sheetRows("10. Sınıf Genel Deneme Analizi");
  const subjects = [];
  let group = "";
  let current = null;
  const flush = () => {
    if (!current) return;
    const subject = titleCaseTr(current.name);
    const id = `maarif10-gd-${slugify(subject)}`;
    subjects.push({ id, group: current.group, name: subject, units: withIds(id, toUnits(buildTree(current.cells), 1)) });
    current = null;
  };
  for (const row of rows) {
    const cell = (i) => clean(row[i]);
    if (cell(6) === "1. DENEME") {
      flush();
      if (cell(0)) group = cell(0);
      current = { group, name: cell(1), cells: [] };
      continue;
    }
    if (!current) continue;
    const cells = [];
    for (let j = 1; j <= 5; j++) {
      const t = cell(j);
      if (t && !isBool(t)) cells.push({ col: j, text: t });
    }
    if (cells.length) current.cells.push(cells);
  }
  flush();
  return subjects;
}

const { courses: kt, anomalies } = parseKaynakTakibi();
const gd = parseGenelDeneme();
writeFileSync(path.join(OUT_DIR, "maarif10.json"), JSON.stringify(kt, null, 2) + "\n");
writeFileSync(path.join(OUT_DIR, "maarif10-genel-deneme.json"), JSON.stringify(gd, null, 2) + "\n");

const total = (c) => c.units.reduce((a, u) => a + u.topics.length, 0);
console.log("Kaynak Takibi:\n  " + kt.map((c) => `${c.name}: ${c.units.length} units / ${total(c)} topics`).join("\n  "));
console.log("Genel Deneme:\n  " + gd.map((c) => `[${c.group}] ${c.name}: ${c.units.length} units / ${total(c)} topics`).join("\n  "));
console.log("Structure notes:\n  " + anomalies.join("\n  "));
console.log("Corrections applied:");
for (const a of applied) console.log(`  [${a.kind}] ${JSON.stringify(a.from)} -> ${JSON.stringify(a.to)}`);
