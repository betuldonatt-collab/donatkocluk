import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/kaynak-takibi/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { EditableCourseTable } from "@/app/coach/students/[id]/_components/editable-course-table";
import { defaultTaskFormValue, TaskFormFields } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { CourseTable } from "@/app/student/kaynak-takibi/_components/course-table";
import { TopicGroupSelect } from "@/components/topic-group-select";
import { AYT_COURSES_BY_TRACK, findCourseById, TYT_COURSES, topicOptionsForCourse } from "./curriculum";
import { PROBLEMLER_MASTER_ID } from "./curriculum/problemler";
import { flattenSelectionRows } from "./curriculum/rows";
import { groupOfTopic, groupParentLayout, mainTopicOptions, mainValueOf, topicGroups, type Stat } from "./curriculum/topic-groups";

const stat = (total: number, correct: number, wrong: number, empty: number): Stat => ({ total, correct, wrong, empty });
const course = (id: string) => findCourseById(id)!;

// The units that have a "(Genel)" master topic, per course -- exactly the requested ones.
const TARIH_UNITS = [
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
];
const EXPECTED: Record<string, string[]> = {
  "tyt-matematik": ["Problemler"],
  "tyt-fizik": ["Dalgalar", "Optik"],
  "tyt-biyoloji": ["Temel Bileşenler/ Yaşam Bilimi Biyoloji", "Hücre", "Canlılar Dünyası", "Hücre Bölünmeleri", "Ekosistem Ekolojisi"],
  "ayt-matematik-sayisal": ["Trigonometri"],
  "ayt-matematik-ea": ["Trigonometri"],
  "ayt-kimya": ["Modern Atom Teorisi", "Sıvı Çözeltiler ve Çözünürlük", "Kimyasal Tepkimelerde Enerji", "Denge", "Kimya ve Elektrik", "Organik Kimya"],
  "ayt-biyoloji": ["Genden Proteine", "Canlılarda Enerji Dönüşümleri", "Bitki Biyolojisi"],
  "ayt-tarih-1-ea": TARIH_UNITS,
  "ayt-tarih-1-sozel": TARIH_UNITS,
};

describe("which units have a master '(Genel)' topic", () => {
  for (const [id, units] of Object.entries(EXPECTED)) {
    it(`${id}: exactly ${units.length} grouped unit(s), each master first in its unit and named '<unit> (Genel)'`, () => {
      const c = course(id);
      expect(topicGroups(c).map((g) => g.unitLabel)).toEqual(units);
      for (const g of topicGroups(c)) {
        const unit = c.units.find((u) => u.unit === g.unitLabel)!;
        expect(unit.topics[0]).toMatchObject({ id: g.masterId, name: g.unitLabel + " (Genel)" });
        expect(g.members.length).toBeGreaterThanOrEqual(1);
      }
      const ids = c.units.flatMap((u) => u.topics.map((t) => t.id));
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it("no other TYT / AYT course has one (every other course stays exactly as it was)", () => {
    const all = [...TYT_COURSES, ...AYT_COURSES_BY_TRACK.sayisal, ...AYT_COURSES_BY_TRACK.ea, ...AYT_COURSES_BY_TRACK.sozel];
    for (const c of all) {
      if (EXPECTED[c.id]) continue;
      expect(topicGroups(c), c.id).toEqual([]);
      expect(c.units.some((u) => u.topics.some((t) => t.name.endsWith(" (Genel)"))), c.id).toBe(false);
    }
  });

  it("master topics only ever sit in headed units, never in a '-' unit", () => {
    for (const id of Object.keys(EXPECTED)) {
      for (const u of course(id).units) if (u.unit === "-") expect(u.topics.some((t) => t.name.endsWith(" (Genel)")), id).toBe(false);
    }
  });
});

describe("the requested exceptions stay flat and fully expanded", () => {
  it("TYT Fizik: only Dalgalar and Optik are grouped; the other ten topics are flat in the picker", () => {
    const c = course("tyt-fizik");
    expect(topicGroups(c).map((g) => g.unitLabel)).toEqual(["Dalgalar", "Optik"]);
    const main = mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label);
    for (const flat of ["Fizik Bilimine Giriş", "Madde ve Özellikleri", "Hareket ve Kuvvet", "İş, Güç, Enerji", "Isı, Sıcaklık ve Genleşme", "Elektrostatik", "Elektrik Akımı ve Devreler", "Mıknatıslar ve Manyetizma", "Basınç", "Kaldırma Kuvveti"]) {
      expect(main, flat).toContain(flat);
    }
    expect(main).toContain("Dalgalar (Genel)");
    expect(main).toContain("Optik (Genel)");
    // their subtopics are reached through the secondary picker
    for (const hidden of ["Yay Dalgaları", "Ses Dalgaları", "Aydınlanma", "Mercekler ve Optik Araçlar/ Prizmalar"]) expect(main, hidden).not.toContain(hidden);
  });

  it("TYT Biyoloji: 'Hücre Bölünmeleri' is grouped, but Kalıtım stays its own flat topic outside the group", () => {
    const c = course("tyt-biyoloji");
    const g = topicGroups(c).find((x) => x.unitLabel === "Hücre Bölünmeleri")!;
    expect(g.members.map((t) => t.name)).toEqual(["Mitoz", "Eşeysiz Üreme", "Mayoz", "Eşeyli Üreme"]);
    const kalitim = c.units.flatMap((u) => u.topics).find((t) => t.name === "Kalıtım")!;
    expect(groupOfTopic(c, kalitim.id)).toBeNull();
    expect(mainValueOf(c, kalitim.id)).toBe(kalitim.id);
    const main = mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label);
    expect(main).toContain("Kalıtım");
    expect(main).toContain("Hücre Bölünmeleri (Genel)");
    expect(main).not.toContain("Mitoz");
  });

  it("AYT Biyoloji: 'İnsan Fizyolojisi' is not grouped -- all nine topics stay listed individually", () => {
    const c = course("ayt-biyoloji");
    expect(topicGroups(c).map((g) => g.unitLabel)).not.toContain("İnsan Fizyolojisi");
    const unit = c.units.find((u) => u.unit === "İnsan Fizyolojisi")!;
    expect(unit.topics).toHaveLength(9);
    expect(unit.topics.some((t) => t.name.endsWith("(Genel)"))).toBe(false);
    const main = mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label);
    for (const t of unit.topics) expect(main, t.name).toContain(t.name);
  });

  it("AYT Tarih 1: topics without a unit header stay flat, and a unit with a single topic has nothing to group", () => {
    for (const id of ["ayt-tarih-1-ea", "ayt-tarih-1-sozel"]) {
      const c = course(id);
      const main = mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label);
      for (const flat of ["Tarih ve Zaman", "Devletleşme Sürecinde Savaşçılar ve Askerler", "Dünya Gücü Osmanlı", "II. Dünya Savaşı Sürecinde Türkiye ve Dünya", "Atatürk Dönemi Dış Politikası"]) {
        expect(main, id + " " + flat).toContain(flat);
      }
      expect(topicGroups(c).map((g) => g.unitLabel)).not.toContain("İki Savaş Arası Dönemde Türkiye ve Dünya");
    }
  });

  it("AYT Matematik (Sayısal and EA): Trigonometri is grouped, the rest is flat", () => {
    for (const id of ["ayt-matematik-sayisal", "ayt-matematik-ea"]) {
      const c = course(id);
      const g = topicGroups(c)[0];
      expect(g.members.map((t) => t.name)).toEqual([
        "Yönlü Açılar, Trigonometrik Fonksiyonlar",
        "Cos-Sin Teoremleri, Ters Trigonometrik Fonksiyonlar",
        "Toplam-Fark ve İki Kat Açı Formülleri",
        "Trigonometrik Denklemler",
      ]);
      const main = mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label);
      for (const flat of ["Denklem ve Eşitsizlikler", "Logaritma", "Türev", "İntegral", "Permütasyon - Kombinasyon"]) expect(main, flat).toContain(flat);
      expect(main).toContain("Trigonometri (Genel)");
      expect(main).not.toContain("Trigonometrik Denklemler");
    }
  });

  it("AYT Kimya: Gazlar (no unit header) stays flat", () => {
    const c = course("ayt-kimya");
    expect(mainTopicOptions(c, topicOptionsForCourse(c)).map((o) => o.label)).toContain("Gazlar");
    expect(topicGroups(c)).toHaveLength(6);
  });
});

describe("the two-step picker", () => {
  const html = (courseId: string, topicId: string) => renderToStaticMarkup(<TopicGroupSelect course={course(courseId)} topicId={topicId} onChange={() => {}} />);
  const trig = topicGroups(course("ayt-matematik-sayisal"))[0];

  it("shows 'Genel' and the specific subtopics once a master topic (or one of its subtopics) is selected", () => {
    for (const topicId of [trig.masterId, trig.members[2].id]) {
      const out = html("ayt-matematik-sayisal", topicId);
      expect(out).toContain("Alt konu (opsiyonel)");
      expect(out).toContain(">Genel<");
      for (const t of trig.members) expect(out).toContain(t.name);
    }
    expect(html("ayt-matematik-sayisal", trig.members[2].id)).toContain(`<option value="${trig.members[2].id}" selected`);
    expect(html("ayt-matematik-sayisal", trig.masterId)).toMatch(/<option value="" selected/);
  });

  it("keeps the Problemler wording", () => {
    const out = html("tyt-matematik", PROBLEMLER_MASTER_ID);
    expect(out).toContain("Problem türü (opsiyonel)");
    expect(out).toContain("Genel (tüm problemler)");
  });

  it("shows nothing for a flat topic (Kalıtım, a headerless topic, another course's topic)", () => {
    const kalitim = course("tyt-biyoloji").units.flatMap((u) => u.topics).find((t) => t.name === "Kalıtım")!;
    expect(html("tyt-biyoloji", kalitim.id)).toBe("");
    expect(html("ayt-kimya", course("ayt-kimya").units.find((u) => u.unit === "-")!.topics[0].id)).toBe("");
    expect(html("tyt-fizik", "")).toBe("");
    expect(html("tyt-turkce", "tyt-turkce-u0-t0")).toBe("");
  });

  it("is part of the coach's form for any grouped course", () => {
    const form = (topicId: string) =>
      renderToStaticMarkup(<TaskFormFields value={{ ...defaultTaskFormValue("YKS"), courseId: "tyt-fizik", topicId }} onChange={() => {}} />);
    const dalga = topicGroups(course("tyt-fizik"))[0];
    expect(form(dalga.masterId)).toContain("Alt konu (opsiyonel)");
    expect(form(dalga.members[1].id)).toContain("Alt konu (opsiyonel)");
    expect(form("")).not.toContain("Alt konu (opsiyonel)");
    const flatTopic = course("tyt-fizik").units[0].topics[0].id;
    expect(form(flatTopic)).not.toContain("Alt konu (opsiyonel)");
  });
});

describe("Kaynak Takibi: a parent row with the cumulative stats for every grouped unit", () => {
  const render = (id: string, byTopic: Record<string, Stat>, student = true) => {
    const topicStats = { byTopic, karma: stat(0, 0, 0, 0) };
    const c = course(id);
    return renderToStaticMarkup(
      student ? (
        <CourseTable course={c} resources={[{ id: "r1", name: "Kaynak A" }]} progress={{}} topicStats={topicStats} onAddResource={async () => {}} onToggle={() => {}} />
      ) : (
        <EditableCourseTable
          course={c}
          resources={[{ id: "r1", name: "Kaynak A", is_active: true }]}
          progress={{}}
          topicStats={topicStats}
          onAddResource={() => {}}
          onToggle={() => {}}
          onArchiveResource={() => {}}
          onReactivateResource={() => {}}
          onDeleteResource={async () => {}}
        />
      ),
    );
  };

  it("one parent row per grouped unit, in the student's and the coach's table", () => {
    for (const [id, n] of Object.entries(EXPECTED).map(([k, v]) => [k, v.length] as const)) {
      for (const student of [true, false]) {
        expect((render(id, {}, student).match(/data-topic-group-parent/g) ?? []).length, id + (student ? " student" : " coach")).toBe(n);
      }
    }
  });

  it("is absent for every other course", () => {
    for (const id of ["tyt-turkce", "tyt-kimya", "ayt-fizik", "ayt-edebiyat-ea"]) expect(render(id, {})).not.toContain("data-topic-group-parent");
  });

  it("TYT Fizik 'Dalgalar': the parent row adds up the master and all five subtopics", () => {
    const g = topicGroups(course("tyt-fizik"))[0];
    const byTopic: Record<string, Stat> = { [g.masterId]: stat(10, 6, 3, 1), [g.members[0].id]: stat(20, 15, 4, 1), [g.members[4].id]: stat(5, 2, 2, 1), "tyt-fizik-u0-t0": stat(99, 99, 0, 0) };
    const html = render("tyt-fizik", byTopic);
    const parent = html.slice(html.indexOf("data-topic-group-parent"));
    const row = parent.slice(0, parent.indexOf("</tr>"));
    expect(row).toContain(">35<");
    expect(row).toContain(">23<");
    expect(row).toContain(">9<");
    expect(row).toContain(">3<");
    expect(row).toContain("Dalgalar");
  });

  it("TYT Biyoloji 'Hücre Bölünmeleri': the cumulative row leaves Kalıtım out; the unit cell spans master + five topics + parent", () => {
    const c = course("tyt-biyoloji");
    const g = topicGroups(c).find((x) => x.unitLabel === "Hücre Bölünmeleri")!;
    const kalitim = c.units.flatMap((u) => u.topics).find((t) => t.name === "Kalıtım")!;
    const byTopic: Record<string, Stat> = { [g.members[0].id]: stat(10, 8, 1, 1), [g.members[2].id]: stat(10, 5, 4, 1), [kalitim.id]: stat(100, 90, 5, 5) };
    const html = render("tyt-biyoloji", byTopic);
    const row = html.split("<tr").find((r) => r.includes("data-topic-group-parent") && r.includes('whitespace-normal">Hücre Bölünmeleri<'))!;
    expect(row).toBeTruthy();
    expect(row).toContain(">20<");
    expect(row).not.toContain(">120<");
    expect(row).not.toContain(">110<");
    expect(row).toContain('rowSpan="7"');
    // Kalıtım keeps its own row with its own figures
    expect(html).toContain("Kalıtım");
    const kRow = html.split("<tr").find((r) => r.includes(">Kalıtım<"))!;
    expect(kRow).toContain(">100<");
  });

  it("the layout gives the first row's unit cell to the parent (one row taller) and leaves flat units alone", () => {
    const c = course("tyt-fizik");
    const rows = flattenSelectionRows(c);
    const { parentBefore, unitSpan } = groupParentLayout(c, rows);
    const dalga = topicGroups(c)[0];
    expect(parentBefore.get(dalga.masterId)).toMatchObject({ unitLabel: "Dalgalar", unitRowSpan: 7 });
    expect(unitSpan(rows.find((r) => r.id === dalga.masterId)!)).toBeNull();
    // the ten flat topics keep their own one-row unit cells
    expect(unitSpan(rows[0])).toBe(1);
  });
});
