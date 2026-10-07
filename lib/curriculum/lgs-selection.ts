// LGS (8th grade) curriculum UI simplification: the raw curriculum
// (lib/curriculum/lgs.json) stays exactly as granular as the official
// workbook -- this module never touches it -- but Task Assignment, Kaynak
// Takibi and Analiz/Gelişim Haritası all need to offer a MUCH coarser
// "selectable" node per subject, per an explicit coach request that the
// full Ünite -> Konu -> Alt Konu (or Ünite -> Konu) drill-down was too
// granular to use day to day. A "selection node" is that coarser
// checkable/selectable unit; everything it rolls up stays visible as
// read-only context underneath it, never deleted or hidden.
//
// A node's `id` is always a REAL topic id from lgs.json (the first topic
// it rolls up, for a rolled-up node) -- never a synthetic string. That
// matters: validatePipelineStep (lib/topic-pipeline.ts) and every other
// existing "is this topic_id real" check keeps accepting it unchanged, and
// a historical task/mistake/progress row that already used that exact id
// (assigned before this change) keeps landing on the same node with zero
// migration.
import { toTurkishTitleCase, type Course, type Topic } from "./index";
import { isLgsMasterId, lgsMasterUnitLabels } from "./lgs-masters";
import { setLgsGroupsProvider, type TopicGroup } from "./topic-groups";

// lgs.json's `unit` field is a mix of a bare "N. ÜNİTE" (Matematik, Din
// Kültürü -- already short/fine either way) and a full ALL CAPS heading
// (Fen Bilimleri, Türkçe, İnkılap Tarihi, e.g. "1. ÜNİTE: MEVSİMLER VE
// İKLİM") straight from the official workbook -- every course's own
// hand-written `konu`/topic text is already properly cased and untouched
// here. Every node's unitLabel (and, for Fen/Türkçe/İnkılap, its label
// too) comes from this one formatted value, so the fix is universal
// across Task Assignment, Kaynak Takibi and Analiz without a per-surface
// change.
function uniteLabel(unit: string): string {
  return toTurkishTitleCase(unit);
}

export type LgsSelectionNode = {
  id: string;
  label: string;
  // The literal unit text this node belongs under (for the table's own
  // Ünite grouping) -- not shown directly, callers render it themselves.
  unitLabel: string;
  // A Maarif TYT bucket's intermediate heading within its unit (Unit.group), if any.
  groupLabel?: string;
  // The tables show this node's Ünite as a header row above its Konu rows (Fen Bilimleri: every unit is a parent with its
  // Konu listed underneath). See withGroupHeadings in rows.ts.
  unitHeader?: boolean;
  // Names of every topic this node rolls up, to show as read-only context
  // under `label`. Empty means this node IS a real, individually
  // selectable topic (no rollup happened for it) -- e.g. İngilizce, a Fen
  // topic outside Ünite 7, or one of Din Kültürü's peygamber/sure items.
  readOnlyNames: string[];
  // Every real topic id whose tracked data (mistakes, resource progress,
  // question totals, pipeline steps) should be folded onto this node --
  // includes `id` itself. Length 1 for a plain leaf node.
  memberTopicIds: string[];
};

function leaf(t: Topic, unitLabel: string): LgsSelectionNode {
  return { id: t.id, label: t.name, unitLabel, readOnlyNames: [], memberTopicIds: [t.id] };
}

function group(label: string, unitLabel: string, topics: Topic[]): LgsSelectionNode {
  return {
    id: topics[0].id,
    label,
    unitLabel,
    readOnlyNames: topics.map((t) => t.name),
    memberTopicIds: topics.map((t) => t.id),
  };
}

// Din Kültürü's 5 main units, named exactly as the coach asked for them
// (the raw unit labels in lgs.json are just "1. ÜNİTE".."5. ÜNİTE") --
// index-matched to course.units, which is that course's own fixed,
// hand-curated 5-entry list (see lgs.json), never regenerated.
const DIN_KULTURU_UNIT_LABELS = [
  "Kader ve Kaza İnancı",
  "Zekat ve Sadaka",
  "Din, Birey ve Toplum",
  "Hz. Muhammed (s.a.v)",
  "İslam Dininin Temel Kaynakları",
];

// "Bir peygamber tanıyorum" / "Bir sure tanıyorum" items -- explicitly
// called out to stay individually selectable inside their unit, instead of
// folding into that unit's rolled-up group like every other topic in it.
const DIN_KULTURU_EXEMPT_TOPIC_IDS = new Set([
  "lgs-din-kulturu-u0-t4", // Hz. Musa
  "lgs-din-kulturu-u0-t5", // Ayet El Kürsi
  "lgs-din-kulturu-u1-t3", // Hz. Şuayb
  "lgs-din-kulturu-u1-t4", // Maun Suresi
  "lgs-din-kulturu-u2-t2", // Hz. Yusuf
  "lgs-din-kulturu-u2-t3", // Asr Suresi
  "lgs-din-kulturu-u3-t6", // Kureyş Suresi
  "lgs-din-kulturu-u4-t3", // Hz. Nuh
]);

// The single source of truth for "what's checkable" on every LGS
// curriculum surface (Task Assignment's Konu combobox, Kaynak Takibi's
// table rows, Analiz's mistake-tagging and topic maps). Subject-by-subject
// rules, straight from the coach's request:
//   - Matematik: selectable = Konu (one level below Ünite); every unit in
//     lgs.json already carries a konu, so this is just "one node per
//     entry", no cross-entry merging needed.
//   - Fen Bilimleri: selectable = the Konu. Ünite 1-6 list their Konu as
//     plain topics (the MEB konu list: Mevsimlerin Oluşumu, Katı Basıncı,
//     ...), so each topic is its own node; Ünite 7 is the only unit whose
//     entries carry a Konu split, so it keeps the Matematik-style rollup
//     (one node per (Ünite, Konu) entry, its Alt konu read-only). Every
//     unit therefore has 2+ nodes and gets a "(Genel)" master
//     (lib/curriculum/lgs-masters.ts) for the two-step Ünite -> Konu picker.
//   - Türkçe / İnkılap Tarihi (Sosyal): selectable = the Ünite itself --
//     every topic inside it becomes read-only context.
//   - İngilizce: unchanged -- each "Unit N" topic is already Ünite-level
//     granularity (this course has one literal "Üniteler" entry holding
//     all 10 as its topics).
//   - Din Kültürü: selectable = one of the 5 main units, EXCEPT the
//     peygamber/sure items, which stay individually selectable.
export function lgsSelectionNodes(course: Course): LgsSelectionNode[] {
  const nodes = selectionNodesWithMasters(course);
  // A course with unit masters (Fen Bilimleri) reads as Ünite -> Konu everywhere: its tables put each Ünite in a header row.
  return lgsMasterUnitLabels(course.id).length > 0 ? nodes.map((n) => ({ ...n, unitHeader: true })) : nodes;
}

function selectionNodesWithMasters(course: Course): LgsSelectionNode[] {
  // The unit masters ("1. Ünite (Genel)", lib/curriculum/lgs-masters.ts) are entries of their own: the rules below see
  // the course as lgs.json defines it, and each master becomes the FIRST node of its unit.
  const masters = course.units.filter((u) => u.topics.length === 1 && isLgsMasterId(u.topics[0].id));
  if (masters.length === 0) return nativeSelectionNodes(course);
  const native = nativeSelectionNodes({ ...course, units: course.units.filter((u) => !masters.includes(u)) });
  const masterNodeByUnit = new Map(
    masters.map((u) => [uniteLabel(u.unit), leaf(u.topics[0], uniteLabel(u.unit))] as const),
  );
  const nodes: LgsSelectionNode[] = [];
  const placed = new Set<string>();
  for (const node of native) {
    const master = masterNodeByUnit.get(node.unitLabel);
    if (master && !placed.has(node.unitLabel)) {
      placed.add(node.unitLabel);
      nodes.push(master);
    }
    nodes.push(node);
  }
  return nodes;
}

function nativeSelectionNodes(course: Course): LgsSelectionNode[] {
  switch (course.id) {
    case "lgs-matematik":
      return course.units.map((u) => {
        const unit = uniteLabel(u.unit);
        return group(u.konu ?? unit, unit, u.topics);
      });

    case "lgs-fen-bilimleri":
      return course.units.flatMap((u) => {
        const unit = uniteLabel(u.unit);
        // Ünite 1-6 list their Konu as plain topics (Mevsimlerin Oluşumu, Katı Basıncı, ...): each is its own node. Ünite 7
        // splits into Konu entries whose topics are Alt konu: one rolled-up node per Konu, as for Matematik.
        return u.konu === undefined ? u.topics.map((t) => leaf(t, unit)) : [group(u.konu, unit, u.topics)];
      });

    case "lgs-turkce":
    case "lgs-inkilap-tarihi":
      return course.units.map((u) => {
        const unit = uniteLabel(u.unit);
        return group(unit, unit, u.topics);
      });

    case "lgs-din-kulturu":
      return course.units.flatMap((u, i) => {
        const unit = uniteLabel(u.unit);
        const rolled = u.topics.filter((t) => !DIN_KULTURU_EXEMPT_TOPIC_IDS.has(t.id));
        const exempt = u.topics.filter((t) => DIN_KULTURU_EXEMPT_TOPIC_IDS.has(t.id));
        const nodes: LgsSelectionNode[] = [];
        if (rolled.length > 0) nodes.push(group(DIN_KULTURU_UNIT_LABELS[i] ?? unit, unit, rolled));
        nodes.push(...exempt.map((t) => leaf(t, unit)));
        return nodes;
      });

    default:
      // İngilizce, and any non-LGS course this is ever called on: one
      // node per existing topic, identical to the old ungrouped behavior.
      return course.units.flatMap((u) => {
        const unit = uniteLabel(u.unit);
        return u.topics.map((t) => leaf(t, unit));
      });
  }
}

// The groups of the Ünite -> Konu picker (lib/curriculum/topic-groups.ts) of an LGS course: a unit with a master is
// offered as that master, and its second step lists the unit's other selection NODES (never the raw Alt konu topics --
// each node's id is a real topic id, see the header). `allTopicIds` is every raw topic the group's rows fold, so a
// Kaynak Takibi parent row totals the same figures its rows show.
function lgsTopicGroups(course: Course): TopicGroup[] {
  const nodes = lgsSelectionNodes(course);
  const groups: TopicGroup[] = [];
  for (const master of nodes) {
    if (!isLgsMasterId(master.id)) continue;
    const members = nodes.filter((n) => n.unitLabel === master.unitLabel && n.id !== master.id);
    groups.push({
      unitLabel: master.unitLabel,
      masterId: master.id,
      members: members.map((n) => ({ id: n.id, name: n.label })),
      allTopicIds: [master.id, ...members.flatMap((n) => n.memberTopicIds)],
    });
  }
  return groups;
}

setLgsGroupsProvider(lgsTopicGroups);

// Folds any real topic id (an old granular one from before this change, or
// a node's own representative id) onto its selection node's id -- the one
// place every stats/mistake aggregation funnels a stored topic_id through
// so historical data rolls up under the new coarser node with no
// migration. Returns the id unchanged if it doesn't belong to any node
// (e.g. "karma", or a course this was never meant to run on).
export function lgsNodeIdForTopicId(course: Course, topicId: string): string {
  for (const node of lgsSelectionNodes(course)) {
    if (node.memberTopicIds.includes(topicId)) return node.id;
  }
  return topicId;
}
