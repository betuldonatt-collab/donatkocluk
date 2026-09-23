import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { isLgsCourseId, type Course, type Topic } from "@/lib/curriculum";
import { courseHasKonu, flattenCourseRows } from "@/lib/curriculum/rows";

export const PAST_QUESTION_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
// The LGS workbook covers 2020-2025 only.
export const LGS_PAST_QUESTION_YEARS = [2025, 2024, 2023, 2022, 2021, 2020];

// Explicit, hand-verified source of truth for which (course, unit) pairs
// get a single spanning question-count total instead of one number per
// sub-topic. Nothing here is derived or guessed from course.units at
// render time — every boundary was confirmed against the source workbooks.
// A course with no entry here (TYT Kimya/Tarih/Felsefe/Din, AYT Tarih 2/
// Psikoloji/Sosyoloji/Mantık/Din, ...) renders fully flat regardless of
// whatever unit labels its curriculum data happens to carry.
//
// "*" = every named (non-"-") unit in this course is a group — used for
// courses confirmed to be grouped end to end, with no flat leftover
// topics (TYT Geometri/Biyoloji/Coğrafya, AYT Coğrafya 1/2).
//
// Everywhere else, an explicit unit-name list — a course can be a MIX of
// grouped units and flat individual topics, so only the units named here
// span; every other topic in that same course still renders as its own
// row. The underlying unit boundaries these names resolve against were
// corrected in scripts/parse-curriculum.mjs (splitUnitAt/renameUnit) to
// match this exact mapping, so the Ünite column's rowSpan and the
// frequency total's rowSpan always cover the same rows.
const FREQUENCY_GROUP_UNITS: Record<string, "*" | string[]> = {
  "tyt-turkce": ["Anlam Bilgisi", "İsim Soylu Sözcükler", "Fiiller"],
  "tyt-matematik": ["Problemler"],
  "tyt-geometri": "*",
  "tyt-fizik": ["Dalgalar", "Optik"],
  "tyt-biyoloji": "*",
  "tyt-cografya": "*",
  "ayt-matematik-sayisal": ["Sayma ve Olasılık", "Trigonometri"],
  "ayt-matematik-ea": ["Sayma ve Olasılık", "Trigonometri"],
  "ayt-geometri-sayisal": ["Geometri", "Analitik Geometri", "Uzay Geometri"],
  "ayt-geometri-ea": ["Geometri", "Analitik Geometri", "Uzay Geometri"],
  "ayt-fizik": ["Kuvvet ve Hareket", "Elektrik ve Manyetizma", "Çembersel Hareket"],
  "ayt-kimya": [
    "Modern Atom Teorisi",
    "Sıvı Çözeltiler ve Çözünürlük",
    "Kimyasal Tepkimelerde Enerji",
    "Denge",
    "Kimya ve Elektrik",
    "Organik Kimya",
  ],
  "ayt-biyoloji": [
    "İnsan Fizyolojisi",
    "Genden Proteine",
    "Canlılarda Enerji Dönüşümleri",
    "Bitki Biyolojisi",
  ],
  "ayt-edebiyat-ea": [
    "Halk Edebiyatı",
    "Divan Edebiyatı",
    "Milli Edebiyat",
    "Cumhuriyet Şiiri",
    "Cumhuriyet Hikayesi",
    "Cumhuriyet Romanı",
  ],
  "ayt-edebiyat-sozel": [
    "Halk Edebiyatı",
    "Divan Edebiyatı",
    "Milli Edebiyat",
    "Cumhuriyet Şiiri",
    "Cumhuriyet Hikayesi",
    "Cumhuriyet Romanı",
  ],
  "ayt-tarih-1-ea": [
    "İnsanlığın İlk Dönemleri",
    "İlk ve Orta Çağlarda Türk Dünyası",
    "İslam Medeniyetinin Doğuşu",
    "Türklerin İslamiyeti Kabulü ve İlk Türk İslam Devletleri",
    "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi",
    "Beylikten Devlete Osmanlı Siyaseti",
    "Uluslararası İlişkilerde Denge Stratejisi",
    "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya",
    "Milli Mücadele",
    "Atatürkçülük ve Türk İnkılabı",
    "İki Savaş Arası Dönemde Türkiye ve Dünya",
  ],
  "ayt-tarih-1-sozel": [
    "İnsanlığın İlk Dönemleri",
    "İlk ve Orta Çağlarda Türk Dünyası",
    "İslam Medeniyetinin Doğuşu",
    "Türklerin İslamiyeti Kabulü ve İlk Türk İslam Devletleri",
    "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi",
    "Beylikten Devlete Osmanlı Siyaseti",
    "Uluslararası İlişkilerde Denge Stratejisi",
    "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya",
    "Milli Mücadele",
    "Atatürkçülük ve Türk İnkılabı",
    "İki Savaş Arası Dönemde Türkiye ve Dünya",
  ],
  "ayt-cografya-1-ea": "*",
  "ayt-cografya-1-sozel": "*",
  "ayt-cografya-2": "*",
};

type Row = {
  topic: Topic;
  unitLabel: string;
  unitRowSpan: number | null;
  // LGS's middle level (see lib/curriculum/rows.ts); always null/absent for YKS.
  konuLabel?: string | null;
  konuRowSpan?: number | null;
  group: { members: string[]; isFirst: boolean } | null;
};

// LGS's workbook records a question count once per frequency group (e.g.
// "Basınç" covers four Konu rows) -- on the FIRST row of the group, blank
// on the rest. So a group starts at every topic that carries a frequency
// and runs until the next one, and the shared spanning cell shows that
// one number, exactly like YKS's explicitly-listed grouped units do.
function flattenLgsRows(course: Course): Row[] {
  const base = flattenCourseRows(course);
  const rows: Row[] = base.map((r) => ({ ...r, group: null }));

  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    const startsNewGroup = i === rows.length || rows[i].topic.frequency !== undefined;
    if (!startsNewGroup) continue;
    const members = rows.slice(start, i).map((r) => r.topic.id);
    if (members.length > 1) {
      rows.slice(start, i).forEach((r, k) => {
        r.group = { members, isFirst: k === 0 };
      });
    }
    start = i;
  }
  return rows;
}

function isGroupedUnitName(course: Course, unitName: string): boolean {
  const config = FREQUENCY_GROUP_UNITS[course.id];
  if (!config) return false;
  return config === "*" ? true : config.includes(unitName);
}

function flattenRows(course: Course): Row[] {
  const rows: Row[] = [];
  for (const group of course.units) {
    const isGroupedUnit = group.unit !== "-" && isGroupedUnitName(course, group.unit);
    const members = isGroupedUnit ? group.topics.map((t) => t.id) : null;

    if (group.unit === "-") {
      for (const topic of group.topics) {
        rows.push({ topic, unitLabel: "-", unitRowSpan: 1, group: null });
      }
    } else {
      group.topics.forEach((topic, i) => {
        rows.push({
          topic,
          unitLabel: group.unit,
          unitRowSpan: i === 0 ? group.topics.length : null,
          group: members ? { members, isFirst: i === 0 } : null,
        });
      });
    }
  }
  return rows;
}

function sumFrequency(topics: Topic[], memberIds: string[], year: number): number | undefined {
  const byId = new Map(topics.map((t) => [t.id, t]));
  let sum = 0;
  let hasAny = false;
  for (const id of memberIds) {
    const v = byId.get(id)?.frequency?.[String(year)];
    if (v !== undefined) {
      sum += v;
      hasAny = true;
    }
  }
  return hasAny ? sum : undefined;
}

function FrequencyCell({ count }: { count: number | undefined }) {
  return (
    <div className="flex h-full items-center justify-center">
      {count === undefined ? (
        <span className="text-muted-foreground/40" title="Bu konu için kayıt yok">
          –
        </span>
      ) : count === 0 ? (
        <span className="text-muted-foreground">0</span>
      ) : (
        <span className="font-medium">{count}</span>
      )}
    </div>
  );
}

// A pure reference table — no student state, nothing to save. Just how
// many questions came from each topic (or topic cluster) in each year,
// straight from the curriculum data, so a student can see which topics
// carry the most exam weight.
export function PastQuestionsTable({ course }: { course: Course }) {
  const isLgs = isLgsCourseId(course.id);
  const rows = isLgs ? flattenLgsRows(course) : flattenRows(course);
  const allTopics = rows.map((r) => r.topic);
  const years = isLgs ? LGS_PAST_QUESTION_YEARS : PAST_QUESTION_YEARS;
  const hasKonu = isLgs && courseHasKonu(course);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{course.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 align-bottom">Ünite</TableHead>
              {hasKonu && <TableHead className="align-bottom">Konu</TableHead>}
              <TableHead className="align-bottom">{hasKonu ? "Alt Konu" : "Konu"}</TableHead>
              {years.map((year) => (
                <TableHead key={year} className="border-l text-center">
                  {year}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.topic.id}>
                {row.unitRowSpan !== null && (
                  <TableCell
                    rowSpan={row.unitRowSpan}
                    className={cn("border-r p-0 text-center align-middle", row.unitRowSpan === 1 && "text-muted-foreground")}
                  >
                    {row.unitLabel === "-" ? (
                      "-"
                    ) : (
                      <div className="flex h-full items-center justify-center py-2">
                        <span className="[writing-mode:vertical-rl] rotate-180 font-medium">
                          {row.unitLabel}
                        </span>
                      </div>
                    )}
                  </TableCell>
                )}
                {hasKonu && row.konuRowSpan != null && (
                  <TableCell rowSpan={row.konuRowSpan} className="border-r align-middle font-medium whitespace-normal">
                    {row.konuLabel}
                  </TableCell>
                )}
                <TableCell
                  // A topic with no Konu of its own inside a course that has
                  // some spans both columns rather than leaving one empty.
                  colSpan={hasKonu && row.konuLabel == null ? 2 : 1}
                  className="font-medium whitespace-normal"
                >
                  {row.topic.name}
                </TableCell>
                {years.map((year) => {
                  if (row.group && !row.group.isFirst) return null; // covered by the group's spanning cell above
                  const count = row.group
                    ? sumFrequency(allTopics, row.group.members, year)
                    : row.topic.frequency?.[String(year)];
                  return (
                    <TableCell
                      key={year}
                      rowSpan={row.group ? row.group.members.length : 1}
                      className={cn(
                        "border-l p-0 text-center tabular-nums",
                        row.group && "bg-accent/40",
                      )}
                    >
                      <FrequencyCell count={count} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
