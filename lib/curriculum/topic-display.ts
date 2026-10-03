// How a Maarif unit's topics are laid out in the Kaynak Takibi table.
//
// A topic's name carries its whole path: "Metin Türleri › Deneme",
// "Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler › Ekonomik Faaliyetleri
// Etkileyen Doğal Faktörler". Printed per row that repeats every heading on
// every line. Here the path becomes a tree instead: each heading is written
// ONCE as its own line, with the topics under it on clean lines of their own.
//
// Display only -- the stored names are untouched, and the pickers / analysis
// pages keep the full path (a bare "Konu" or "Deneme" would be ambiguous
// there).
const SEP = " › ";

export type TopicLine =
  | { kind: "heading"; text: string; depth: number }
  | { kind: "topic"; topicId: string; text: string; depth: number };

// Short connectors that can't start a title ("ve", "ile", ...).
const CONNECTORS = new Set(["ve", "ile", "de", "da", "veya", "ki", "mı", "mi", "mu", "mü"]);

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const key = (w: string) => w.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");

// A topic that restates its heading's opening words ("Ekonomik Faaliyetleri
// Etkileyen" ... "Doğal Faktörler") is cut down to what is new, since the
// heading sits right above it. Needs at least 3 repeated words (two would
// leave fragments like "Hareketi İle İlgili Veriler" under "Serbest Düşme"),
// something left over, and a remainder that can start a title.
export function coreTopicTitle(heading: string, topic: string): string {
  const h = words(heading);
  const t = words(topic);
  let shared = 0;
  while (shared < h.length && shared < t.length && key(h[shared]) === key(t[shared])) shared++;
  if (shared < 3 || shared >= t.length) return topic;
  if (CONNECTORS.has(key(t[shared]))) return topic;
  const rest = t.slice(shared).join(" ");
  return rest.charAt(0).toLocaleUpperCase("tr-TR") + rest.slice(1);
}

// Flattens a unit's topics into display lines, in order: a heading line the
// first time a heading path appears (one per level, deepest last), then the
// topic's own line indented to sit under it. A topic with no heading is just
// a topic line.
export function topicLinesForUnit(topics: { id: string; name: string }[]): TopicLine[] {
  const lines: TopicLine[] = [];
  let previous: string[] = [];
  for (const topic of topics) {
    const parts = topic.name.split(SEP);
    const headings = parts.slice(0, -1);
    const leaf = parts[parts.length - 1];

    let common = 0;
    while (common < headings.length && common < previous.length && headings[common] === previous[common]) common++;
    for (let depth = common; depth < headings.length; depth++) {
      lines.push({ kind: "heading", text: headings[depth], depth });
    }

    const parent = headings[headings.length - 1];
    lines.push({
      kind: "topic",
      topicId: topic.id,
      text: parent ? coreTopicTitle(parent, leaf) : leaf,
      depth: headings.length,
    });
    previous = headings;
  }
  return lines;
}
