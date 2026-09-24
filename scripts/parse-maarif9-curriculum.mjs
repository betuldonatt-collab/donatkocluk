// Clones the 9th-grade ("Türkiye Yüzyılı Maarif Modeli") curriculum from
// supabase/curriculum-source/"9. Sınıf - Taslak Dosyası.xlsx" into
//   lib/curriculum/maarif9.json               (from "9. Sınıf Kaynak Takibi")
//   lib/curriculum/maarif9-genel-deneme.json  (from "9. Sınıf Genel Deneme Analizi")
//
// Pure data extraction -- nothing here is wired into the app yet, and no
// topic/theme/subject is invented: every string comes from a cell.
//
// Hierarchy (agreed mapping): Subject -> Unit/Theme -> Topic, where the
// sheet's deeper headings are MERGED into the topic name with " › "
// (e.g. "1.2. Metin Türleri › Deneme"); a heading with nothing under it is
// a topic by itself. The sheets nest up to 4 levels below the subject:
// Tema/Ünite -> heading -> sub-heading -> sub-sub-heading (Biyoloji 1.6.x,
// Fizik Isı). Level-1 cells are treated as a "unit" only when they carry
// an ÜNİTE / TEMA / THEME label; otherwise (e.g. Genel Deneme's Türk Dili
// list, which has no themes) the topics have unit = null.
//
// Text: cell line breaks become single spaces (a hyphenated break is
// re-joined), and the few obvious typos in TYPO_FIXES are corrected -- every
// applied correction is printed so it can be reviewed.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "supabase", "curriculum-source", "9. Sınıf - Taslak Dosyası.xlsx");
const OUT_DIR = path.join(ROOT, "lib", "curriculum");

const SEP = " › ";
const TR_MAP = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", I: "I", İ: "i", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
const slugify = (s) =>
  s.split("").map((ch) => TR_MAP[ch] ?? ch).join("").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Whole-cell replacements (matched AFTER whitespace normalisation).
const TYPO_FIXES = new Map([
  ["2. TEMA: ORGANİZAYON", "2. TEMA: ORGANİZASYON"],
  ["Oritmalarda Ve Matematiksel İspatlarda Mantık Bağlaçları Ve Niceleyiciler", "Algoritmalarda Ve Matematiksel İspatlarda Mantık Bağlaçları Ve Niceleyiciler"],
  ["3.ÜNİTE: İSLAM'DA iBADETLER", "3.ÜNİTE: İSLAM'DA İBADETLER"],
  ["2.Ünite: İslam'Da İnanç Esasları", "2.Ünite: İslam'da İnanç Esasları"],
  ["3.Ünite: İslam'Da İbadetler", "3.Ünite: İslam'da İbadetler"],
  ["4.Ünite: İslam'Da Ahlak İlkeleri", "4.Ünite: İslam'da Ahlak İlkeleri"],
  ["5.Ünite: Kur'An'A Göre Hz. Muhammed", "5.Ünite: Kur'an'a Göre Hz. Muhammed"],
]);
const applied = [];
const seenApplied = new Set();
function note(kind, from, to) {
  const key = `${kind}|${from}`;
  if (seenApplied.has(key)) return;
  seenApplied.add(key);
  applied.push({ kind, from, to });
}

function clean(raw) {
  const original = String(raw ?? "").trim();
  let s = original.replace(/-\s*\n\s*/g, "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  if (/\n/.test(original)) note("line-break", original.replace(/\n/g, "⏎"), s);
  const fixed = TYPO_FIXES.get(s);
  if (fixed) {
    note("typo", s, fixed);
    return fixed;
  }
  return s;
}

const isBool = (s) => /^(TRUE|FALSE)$/i.test(s);
const UNIT_LABEL = /(ÜNİTE|ÜNITE|TEMA|THEME)/i;

// Column-indexed nesting: a cell is a child of the nearest earlier cell in a
// strictly smaller column (so a row that skips a column still nests right).
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

// tree (children of subject) -> [{ unit, topics: string[] }]
function toUnits(subjectNode) {
  const units = [];
  let loose = null;
  for (const n of subjectNode.children) {
    if (UNIT_LABEL.test(n.text)) {
      loose = null;
      units.push({ unit: n.text, topics: n.children.flatMap(leafPaths) });
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

// ---- Kaynak Takibi: three side-by-side column blocks (0, 14, 28), each a
// vertical stack of courses starting at an "Ünite Bilgisi | <course>" row.
function parseKaynakTakibi() {
  const rows = sheetRows("9. Sınıf Kaynak Takibi");
  const courses = [];
  for (const c of [0, 14, 28]) {
    let current = null;
    const flush = () => {
      if (!current) return;
      const tree = buildTree(current.cells);
      const subject = current.name.replace(/^9\.\s*Sınıf:?\s*/i, "");
      const id = `maarif9-${slugify(subject)}`;
      courses.push({ id, name: current.name, units: withIds(id, toUnits(tree)) });
      current = null;
    };
    rows.forEach((row) => {
      const cell = (i) => clean(row[i]);
      if (cell(c) === "Ünite Bilgisi") {
        flush();
        current = { name: cell(c + 1), cells: [] };
        return;
      }
      if (!current) return;
      const cells = [];
      for (let j = c; j <= c + 3; j++) {
        const t = cell(j);
        if (t && !isBool(t)) cells.push({ col: j - c, text: t });
      }
      if (cells.length === 0) return;
      // "1. DÖNEM" / "2. DÖNEM": semester dividers, not curriculum nodes.
      if (cells.length === 1 && /^\d\.\s*DÖNEM$/i.test(cells[0].text)) return;
      current.cells.push(cells);
    });
    flush();
  }
  return courses;
}

// ---- Genel Deneme Analizi: col0 = group (first subject of each group),
// col1..4 = labels; a subject row is the one that carries "1. DENEME" in col5.
function parseGenelDeneme() {
  const rows = sheetRows("9. Sınıf Genel Deneme Analizi");
  const subjects = [];
  let group = "";
  let current = null;
  const flush = () => {
    if (!current) return;
    const id = `maarif9-gd-${slugify(current.name)}`;
    subjects.push({ id, group: current.group, name: current.name, units: withIds(id, toUnits(buildTree(current.cells))) });
    current = null;
  };
  for (const row of rows) {
    const cell = (i) => clean(row[i]);
    if (cell(5) === "1. DENEME") {
      flush();
      if (cell(0)) group = cell(0);
      current = { group, name: cell(1), cells: [] };
      continue;
    }
    if (!current) continue;
    const cells = [];
    for (let j = 1; j <= 4; j++) {
      const t = cell(j);
      if (t && !isBool(t)) cells.push({ col: j, text: t });
    }
    if (cells.length) current.cells.push(cells);
  }
  flush();
  return subjects;
}

const kt = parseKaynakTakibi();
const gd = parseGenelDeneme();
writeFileSync(path.join(OUT_DIR, "maarif9.json"), JSON.stringify(kt, null, 2) + "\n");
writeFileSync(path.join(OUT_DIR, "maarif9-genel-deneme.json"), JSON.stringify(gd, null, 2) + "\n");

const total = (c) => c.units.reduce((a, u) => a + u.topics.length, 0);
console.log("Kaynak Takibi:\n  " + kt.map((c) => `${c.name}: ${c.units.length} units / ${total(c)} topics`).join("\n  "));
console.log("Genel Deneme:\n  " + gd.map((c) => `[${c.group}] ${c.name}: ${c.units.length} units / ${total(c)} topics`).join("\n  "));
console.log("Corrections applied:");
for (const a of applied) console.log(`  [${a.kind}] ${JSON.stringify(a.from)} -> ${JSON.stringify(a.to)}`);
