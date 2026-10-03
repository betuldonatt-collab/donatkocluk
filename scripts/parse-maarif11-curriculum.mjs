// Builds lib/curriculum/maarif11.json (11th-grade "Türkiye Yüzyılı Maarif
// Modeli" Kaynak Takibi curriculum) from the plain-text list the coach
// supplied: supabase/curriculum-source/"11. Sınıf - Taslak Dosyası.txt".
//
// Same output shape and rules as scripts/parse-maarif9/10-curriculum.mjs
// (Subject -> Unit -> Topic; deeper headings merged into the topic name with
// " › "), except the hierarchy comes from the list's own numbering instead of
// spreadsheet columns:
//   "N. Ünite: ..." / "N. TEMA: ..."   -> a unit
//   "N.M. ..."                          -> a topic (a leaf when it has no children)
//   "N.M.K. ..."                        -> a child of "N.M." -- the leaf is then
//                                          "N.M. Parent › N.M.K. Child"
// The numbers are KEPT in the data (they carry the ordering); the app strips
// them for display (lib/curriculum/topic-name.ts). Nothing is invented: every
// string is a line of the source. Numbering mistakes in the source are
// reported, not silently fixed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "supabase", "curriculum-source", "11. Sınıf - Taslak Dosyası.txt");
const OUT = path.join(ROOT, "lib", "curriculum", "maarif11.json");

const SEP = " › ";
const TR_MAP = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", I: "I", İ: "i", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
const slugify = (s) =>
  s.split("").map((ch) => TR_MAP[ch] ?? ch).join("").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const clean = (s) => s.replace(/\s+/g, " ").trim();

function titleCaseTr(s) {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      const lower = w.toLocaleLowerCase("tr");
      if (lower === "ve") return "ve";
      return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
}

const isAllUpper = (s) => s === s.toLocaleUpperCase("tr") && s !== s.toLocaleLowerCase("tr");

const notes = [];
const note = (msg) => notes.push(msg);

// "1.Ünite: X", "1. ÜNİTE: X" -> "1. Ünite: X" (an ALL-CAPS title is Title
// Cased; Felsefe's units arrive that way). "1. TEMA: X" is kept as written,
// like the 9th grade's TEMA labels.
const UNIT_RE = /^(\d+)\.\s*(Ünite|ÜNİTE|TEMA)(?=\s|:|$)\s*:?\s*(.*)$/;
function unitLabel(m, subject) {
  const [, n, kind, rest] = m;
  const title = clean(rest);
  if (kind === "TEMA") return `${n}. TEMA${title ? `: ${title}` : ""}`;
  const finalTitle = isAllUpper(title) ? titleCaseTr(title) : title;
  const label = `${n}. Ünite${finalTitle ? `: ${finalTitle}` : ""}`;
  if (label !== clean(m[0])) note(`${subject}: unit label "${clean(m[0])}" -> "${label}"`);
  return label;
}

const TOPIC_RE = /^(\d+(?:\.\d+)+)\.\s*(.+)$/;

function parseSubject(rawName, lines) {
  const subject = titleCaseTr(rawName);
  const id = `maarif11-${slugify(subject)}`;
  const units = [];
  let unit = null;
  let parent = null;

  const finishParent = () => {
    if (parent && parent.children.length === 0) unit.topics.push(parent.text);
    parent = null;
  };

  for (const raw of lines) {
    const line = clean(raw);
    const um = UNIT_RE.exec(line);
    if (um) {
      finishParent();
      unit = { unit: unitLabel(um, subject), number: Number(um[1]), topics: [], lastTopic: 0 };
      if (units.length > 0 && unit.number !== units[units.length - 1].number + 1) note(`${subject}: unit ${unit.number} follows unit ${units[units.length - 1].number}`);
      units.push(unit);
      continue;
    }
    const tm = TOPIC_RE.exec(line);
    if (!tm || !unit) throw new Error(`${subject}: cannot place line "${line}"`);
    const parts = tm[1].split(".").map(Number);
    const text = `${tm[1]}. ${clean(tm[2])}`;
    if (parts[0] !== unit.number) note(`${subject}: "${text}" sits under unit ${unit.number}`);

    if (parts.length === 2) {
      finishParent();
      if (parts[1] !== unit.lastTopic + 1) note(`${subject}: "${text}" does not follow topic ${unit.number}.${unit.lastTopic}`);
      unit.lastTopic = parts[1];
      parent = { number: tm[1], text, children: [], lastChild: 0 };
    } else if (parts.length === 3) {
      if (!parent || parent.number !== parts.slice(0, 2).join(".")) throw new Error(`${subject}: "${text}" has no parent "${parts.slice(0, 2).join(".")}"`);
      if (parts[2] !== parent.lastChild + 1) note(`${subject}: "${text}" does not follow ${parent.number}.${parent.lastChild}`);
      parent.lastChild = parts[2];
      parent.children.push(text);
      unit.topics.push(`${parent.text}${SEP}${text}`);
    } else {
      throw new Error(`${subject}: unsupported depth in "${text}"`);
    }
  }
  finishParent();

  return {
    id,
    name: `11. Sınıf ${subject}`,
    units: units.map((u, ui) => ({
      unit: u.unit,
      topics: u.topics.map((name, ti) => ({ id: `${id}-u${ui}-t${ti}`, name })),
    })),
  };
}

// Sections are "### SUBJECT" blocks; blank lines are ignored.
const text = readFileSync(SOURCE, "utf8").replace(/^﻿/, "");
const sections = [];
for (const line of text.split(/\r?\n/)) {
  if (line.startsWith("###")) sections.push({ name: clean(line.slice(3)), lines: [] });
  else if (line.trim() && sections.length) sections[sections.length - 1].lines.push(line);
}

const courses = sections.map((s) => parseSubject(s.name, s.lines));
const ids = courses.map((c) => c.id);
if (new Set(ids).size !== ids.length) throw new Error("duplicate course id");

writeFileSync(OUT, JSON.stringify(courses, null, 2) + "\n");

const total = (c) => c.units.reduce((a, u) => a + u.topics.length, 0);
console.log("Kaynak Takibi:\n  " + courses.map((c) => `${c.name} (${c.id}): ${c.units.length} units / ${total(c)} topics`).join("\n  "));
console.log("Notes:\n  " + (notes.length ? notes.join("\n  ") : "none"));
