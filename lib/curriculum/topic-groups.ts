// Grouped units: a unit of a course whose topics are offered through ONE master topic, "<Unit> (Genel)", plus its
// specific subtopics. Used by the two-step topic picker of the task forms (the coach's "Yeni görev ekle" and the
// student's "Ek Çalışma Ekle") and by the parent row of Kaynak Takibi.
//
// The grouping is part of the curriculum DATA (lib/curriculum/*.json): a unit is grouped exactly when it contains a
// topic named "<unit name> (Genel)". That master topic is a real topic like any other -- it is assigned, tracked in
// Kaynak Takibi, analysed in the exam analysis and picked in the mistake lists -- and the unit's other topics are its
// subtopics. Units without a master (every unit header "-", and the units left flat on purpose) are unaffected.
//
// Which units have a master today (see the data): TYT Matematik "Problemler"; TYT Fizik "Dalgalar" and "Optik"; AYT
// Matematik "Trigonometri"; AYT Kimya, TYT Biyoloji, AYT Biyoloji (except "İnsan Fizyolojisi") and AYT Tarih 1 (Sayısal /
// EA / Sözel versions alike): every headed unit with at least two topics.
import type { Course, Topic } from "./index";
import type { SelectionRow } from "./rows";

export type Stat = { total: number; correct: number; wrong: number; empty: number };
const ZERO: Stat = { total: 0, correct: 0, wrong: 0, empty: 0 };

export function addStats(a: Stat, b: Stat): Stat {
  return { total: a.total + b.total, correct: a.correct + b.correct, wrong: a.wrong + b.wrong, empty: a.empty + b.empty };
}

// Topics of a grouped unit that are NOT part of its group: they stay flat in every list, next to the group, exactly as
// they were. TYT Biyoloji's "Kalıtım" is one of the topics of the unit "Hücre Bölünmeleri", but it is not grouped with
// Mitoz / Mayoz / ... .
const UNGROUPED_TOPIC_NAMES: Record<string, string[]> = {
  "tyt-biyoloji": ["Kalıtım"],
};

// The id of a generated master topic: "<courseId>-genel-u<n>", n = the position of the unit's LABEL among the course's
// distinct unit labels (also what the TYT / AYT data uses; there every unit is one entry, so n is its index).
export function unitMasterId(courseId: string, unitIndex: number): string {
  return `${courseId}-genel-u${unitIndex}`;
}

// The distinct unit labels of a course, in order, with a "-" (headerless) or empty label left out: those have no unit to
// group. A course can list one unit as several entries (the merged "Maarif TYT" courses: one entry per bucket).
function groupableLabels(units: { unit: string | null }[]): string[] {
  const labels: string[] = [];
  for (const u of units) if (u.unit && u.unit !== "-" && !labels.includes(u.unit)) labels.push(u.unit);
  return labels;
}

// "1. Ünite: Kuvvet ve Hareket" -> "Kuvvet ve Hareket" (a Maarif unit label without its number): a topic name must never
// start with a hierarchy number on screen, and the master topic is a topic. The merged courses tag a unit with its grade
// ("(9. Sınıf) 1. Ünite: Allah İnsan İlişkisi"): the tag stays, the number goes.
const UNIT_LABEL_PARTS = /^(\(\d+\. Sınıf\)\s*)?(\d+)\.\s*(Ünite|Tema)\s*:\s*(.*)$/i;

function masterBaseName(label: string): { tag: string; title: string; number: string | null } {
  const m = UNIT_LABEL_PARTS.exec(label);
  if (!m || m[4].trim() === "") return { tag: "", title: label, number: null };
  return { tag: m[1] ?? "", title: m[4].trim(), number: `${m[2]}. ${m[3]}` };
}

// Adds a master topic ("<unit title> (Genel)", id from unitMasterId) to every unit that has at least two topics, and
// returns new course objects. For curricula that are generated from a source list by a script or assembled from other
// courses (the 11th grade's maarif11.json, the merged "Maarif TYT" courses): the masters are added when the data is
// loaded, so regenerating the data never loses them. A unit with a single topic has nothing to group and stays flat, as
// does a "-" (headerless) or unlabelled one.
//
// Nothing that exists changes id or position: the master is added LAST in its unit (a Maarif Kaynak Takibi row is
// identified by the first topic of its group -- saved ticks are keyed by it). A unit that is one entry gets the master
// as that entry's last topic; a unit made of several bucket entries gets one more bucket entry, named like the master,
// after them (a Kaynak Takibi row of its own, with the stats of tasks assigned to the unit as a whole).
//
// Two units of one course can share a title (Maarif Matematik "1. Tema: Sayılar" and "3. Tema: Sayılar"): their masters
// then say which one they are ("Sayılar — 1. Tema (Genel)") so they stay apart in a picker.
export function withUnitMasters<
  U extends { unit: string | null; bucket?: string; topics: { id: string; name: string }[] },
  C extends { id: string; units: U[] },
>(courses: C[]): C[] {
  return courses.map((course) => {
    const labels = groupableLabels(course.units);
    const baseNames = labels.map((l) => masterBaseName(l));
    const plain = baseNames.map((b) => `${b.tag}${b.title}`);
    const masterName = (li: number) => {
      const b = baseNames[li];
      const clash = plain.some((n, i) => i !== li && n === plain[li]);
      return `${b.tag}${b.title}${clash && b.number ? ` — ${b.number}` : ""} (Genel)`;
    };

    const topicTotal = (label: string) => course.units.filter((u) => u.unit === label).reduce((n, u) => n + u.topics.length, 0);
    const lastEntryOf = new Map<string, number>();
    course.units.forEach((u, i) => {
      if (u.unit) lastEntryOf.set(u.unit, i);
    });

    const units = course.units.flatMap((unit, i): U[] => {
      const li = unit.unit ? labels.indexOf(unit.unit) : -1;
      if (li === -1 || lastEntryOf.get(unit.unit!) !== i || topicTotal(unit.unit!) < 2) return [unit];
      const master = { id: unitMasterId(course.id, li), name: masterName(li) };
      if (unit.bucket !== undefined) return [unit, { unit: unit.unit, bucket: master.name, topics: [master] } as unknown as U];
      return [{ ...unit, topics: [...unit.topics, master] }];
    });
    return { ...course, units } as C;
  });
}

// The same course without its generated master topics (and the bucket entries that only held one): the course as its
// source data defines it. For tests and tools that check the native structure of a course.
export function withoutUnitMasters<C extends { units: { topics: { id: string }[] }[] }>(course: C): C {
  const isMaster = (id: string) => /-genel-u\d+$/.test(id);
  return {
    ...course,
    units: course.units.map((u) => ({ ...u, topics: u.topics.filter((t) => !isMaster(t.id)) })).filter((u) => u.topics.length > 0),
  } as C;
}

export type TopicGroup = {
  unitLabel: string;
  masterId: string;
  // The specific subtopics offered under the master topic, in curriculum order.
  members: Topic[];
};

const cache = new WeakMap<Course, TopicGroup[]>();

export function topicGroups(course: Course | null | undefined): TopicGroup[] {
  if (!course) return [];
  const cached = cache.get(course);
  if (cached) return cached;
  const flat = new Set(UNGROUPED_TOPIC_NAMES[course.id] ?? []);
  const groups: TopicGroup[] = [];
  for (const [li, label] of groupableLabels(course.units).entries()) {
    // a unit can be several entries (the merged Maarif TYT courses' buckets): its topics are all of them together
    const topics = course.units.filter((u) => u.unit === label).flatMap((u) => u.topics);
    // The master: named "<unit> (Genel)", or carrying the generated master id (units whose label starts with a number).
    const master = topics.find((t) => t.name === label + " (Genel)" || t.id === unitMasterId(course.id, li));
    if (!master) continue;
    groups.push({ unitLabel: label, masterId: master.id, members: topics.filter((t) => t.id !== master.id && !flat.has(t.name)) });
  }
  cache.set(course, groups);
  return groups;
}

// The group a topic id belongs to -- as the master or as one of its subtopics -- or null (a flat topic).
export function groupOfTopic(course: Course | null | undefined, topicId: string): TopicGroup | null {
  if (!topicId) return null;
  return topicGroups(course).find((g) => g.masterId === topicId || g.members.some((t) => t.id === topicId)) ?? null;
}

// What the main Konu picker shows for a stored topic id: a subtopic reads as its master (the secondary picker shows the
// subtopic); every other topic is itself.
export function mainValueOf(course: Course | null | undefined, topicId: string): string {
  return groupOfTopic(course, topicId)?.masterId ?? topicId;
}

// The main Konu list: every topic, except that a group's subtopics are not listed on their own -- they are reached
// through the master topic and the secondary picker. Flat topics (including the ones left flat inside a grouped unit)
// stay exactly where they are.
export function mainTopicOptions<T extends { id: string }>(course: Course | null | undefined, options: T[]): T[] {
  const groups = topicGroups(course);
  if (groups.length === 0) return options;
  const hidden = new Set(groups.flatMap((g) => g.members.map((t) => t.id)));
  return options.filter((o) => !hidden.has(o.id));
}

// --- Kaynak Takibi ----------------------------------------------------------------------------------------------

export function sumTopicStats(byTopic: Record<string, Stat>, topicIds: string[]): Stat {
  return topicIds.reduce((acc, id) => (byTopic[id] ? addStats(acc, byTopic[id]) : acc), { ...ZERO });
}

// The parent row of a grouped unit: spliced in above the unit's first row, it carries the unit cell (so the unit's
// rowSpan grows by one) and the CUMULATIVE Toplam / D / Y / B of the group (the master topic and its subtopics).
export type GroupParent = {
  kind: "parent";
  unitLabel: string;
  unitRowSpan: number;
  memberTopicIds: string[];
};

export function groupParentLayout(
  course: Course,
  rows: SelectionRow[],
): { parentBefore: Map<string, GroupParent>; unitSpan: (row: SelectionRow) => number | null } {
  const parentBefore = new Map<string, GroupParent>();
  for (const group of topicGroups(course)) {
    // the master topic is the first topic of its unit, so its row is the unit's first row
    const first = rows.find((r) => r.id === group.masterId);
    if (!first || first.unitRowSpan === null || first.unitLabel !== group.unitLabel) continue;
    parentBefore.set(first.id, {
      kind: "parent",
      unitLabel: group.unitLabel,
      unitRowSpan: first.unitRowSpan + 1,
      memberTopicIds: [group.masterId, ...group.members.map((t) => t.id)],
    });
  }
  return {
    parentBefore,
    // the first row's unit cell moves up to the parent row
    unitSpan: (row) => (parentBefore.has(row.id) ? null : row.unitRowSpan),
  };
}
