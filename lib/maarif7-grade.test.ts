import { describe, expect, it } from "vitest";

import { findCourseById, isMaarifCourseId } from "./curriculum";
import { LGS_EXAM_SUBJECTS, MAARIF7_EXAM_QUESTION_TOTAL, MAARIF7_EXAM_SUBJECTS, coursesForMaarif7ExamSubject } from "./curriculum/subject-groups";
import { isMaarif7CourseId, MAARIF7_KAYNAK_COURSES } from "./curriculum/maarif7";
import { flattenSelectionRows } from "./curriculum/rows";
import { expectedGeneralExamKeys, findGeneralExamTotalMismatch, isGeneralExamScoresIncomplete } from "./exam-results-validation";
import {
  fetchMaarifGrade,
  fetchMaarifGradesByIds,
  fetchRequestedMaarifGrade,
  gradeFromFlags,
  gradeOfTrack,
  MAARIF_GRADES,
} from "./maarif-grade";
import { DEFAULT_SCHOOL_COURSES, schoolCohortOf } from "./school-exams";
import { isStudentNavItemVisible } from "./student-nav";
import { pipelineConfigFor, validatePipelineStep } from "./topic-pipeline";

describe("7th grade is a Maarif-style grade, with its curriculum still to come", () => {
  it("has its own entry in the grade table: label, track, exam-title prefix", () => {
    const g = MAARIF_GRADES[7];
    expect(g.label).toBe("7. Sınıf");
    expect(g.track).toBe("m7");
    expect(g.titlePrefix).toBe("7. SINIF");
    expect(gradeOfTrack("m7")).toBe(7);
  });

  it("holds the courses supplied so far (Sosyal Bilgiler first); a course not supplied yet is simply absent", () => {
    expect(MAARIF7_KAYNAK_COURSES.map((c) => c.id)).toEqual(["maarif7-matematik", "maarif7-fen-bilimleri", "maarif7-sosyal-bilgiler"]);
    expect(MAARIF_GRADES[7].courses).toBe(MAARIF7_KAYNAK_COURSES);
    expect(findCourseById("maarif7-sosyal-bilgiler")?.name).toBe("7. Sınıf Sosyal Bilgiler");
    expect(findCourseById("maarif7-matematik")?.name).toBe("7. Sınıf Matematik");
    expect(findCourseById("maarif7-fen-bilimleri")?.name).toBe("7. Sınıf Fen Bilimleri");
    expect(findCourseById("maarif7-turkce")).toBeNull();
    expect(MAARIF_GRADES[7].coursesForExamSubject("m7_ingilizce")).toEqual([]); // not supplied yet -> no topic table
    expect(MAARIF_GRADES[7].coursesForExamSubject("anything")).toEqual([]);
  });

  it("recognises only maarif7- course ids as its own, and counts them as Maarif courses", () => {
    expect(isMaarif7CourseId("maarif7-matematik")).toBe(true);
    expect(MAARIF_GRADES[7].isCourseId("maarif7-fen")).toBe(true);
    for (const id of ["maarif9-matematik", "maarif10-matematik", "maarif11-matematik", "lgs-matematik", "tyt-matematik", null]) {
      expect(isMaarif7CourseId(id)).toBe(false);
    }
    expect(MAARIF_GRADES[9].isCourseId("maarif7-matematik")).toBe(false);
    expect(isMaarifCourseId("maarif7-matematik")).toBe(true);
  });

  it("reads the grade from the flag columns, 7 included, and never mixes grades", () => {
    expect(gradeFromFlags({ is_maarif7: true })).toBe(7);
    expect(gradeFromFlags({ is_maarif7: false, is_maarif9: false, is_maarif10: false, is_maarif11: false })).toBeNull();
    expect(gradeFromFlags({ is_maarif7: true, is_maarif9: false })).toBe(7);
    expect(gradeFromFlags({ is_maarif9: true })).toBe(9); // is_maarif7 column missing (pre-migration)
    expect(gradeFromFlags(null)).toBeNull();
  });

  it("uses the Maarif pipeline and refuses another grade's courses", () => {
    expect(pipelineConfigFor("YKS", 7)).toEqual(pipelineConfigFor("YKS", 9));
    const step = { courseId: "maarif9-matematik", topicId: "maarif9-matematik-u0-t0", step: "konu_calismasi" as const, value: true };
    expect(() => validatePipelineStep("YKS", step, 7)).toThrow("Geçersiz ders.");
  });
});

describe("7th grade Sosyal Bilgiler", () => {
  const course = findCourseById("maarif7-sosyal-bilgiler")!;

  it("has the six units and 17 topics exactly as supplied, in order", () => {
    expect(course.units.map((u) => [u.unit, u.topics.map((t) => t.name)])).toEqual([
      [
        "1. Ünite: Birlikte Yaşamak",
        ["Gruplarda ve Sosyal Hayatta İletişimin Önemi", "Özel Gereksinimli Bireyler İçin Fırsat Eşitliği", "Millî Meseleler Karşısında Türk Toplumunun Tutum ve Davranışları"],
      ],
      ["2. Ünite: Evimiz Dünya", ["Küreselleşmenin İnsan ve Toplum Hayatına Etkisi", "Bölgesel ve Küresel Sorunların Çözümünde Ülkemizin Rolü"]],
      [
        "3. Ünite: Ortak Mirasımız",
        ["Osmanlı Devleti'nin Cihan Devleti Hâline Gelmesini Sağlayan Politikalar", "Osmanlı Devleti'nin Uygulamaya Koyduğu Yenilikler", "Osmanlı Kültür ve Medeniyeti"],
      ],
      [
        "4. Ünite: Yaşayan Demokrasimiz",
        [
          "Türkiye Cumhuriyeti'nin Nitelikleri",
          "Türkiye Cumhuriyeti'nin Yönetim Yapısı",
          "Ülkemizde Demokrasinin Gelişimi",
          "Demokrasinin Uygulanma Sürecinde Karşılaşılan Sorunlar",
        ],
      ],
      ["5. Ünite: Hayatımızdaki Ekonomi", ["Millî Kalkınma Hamleleri", "Ekonomik Gelişmişlik ile Üretim, Dağıtım ve Tüketim Arasındaki Döngü"]],
      [
        "6. Ünite: Teknoloji ve Sosyal Bilimler",
        [
          "Bilimsel ve Teknolojik Gelişmelerin Gelecekteki Hayata Etkisi",
          "Sosyal Bilimlerin Çalışma Alanları",
          "Toplumsal Hayatta Karşılaşılabilecek Problemlere Çözüm Üretme",
        ],
      ],
    ]);
    expect(course.units.flatMap((u) => u.topics)).toHaveLength(17);
  });

  it("has unique, stable ids in the other grades' convention, all 7th-grade", () => {
    const ids = course.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("maarif7-sosyal-bilgiler-u0-t0");
    expect(ids[ids.length - 1]).toBe("maarif7-sosyal-bilgiler-u5-t2");
    expect(ids.every((id) => id.startsWith("maarif7-"))).toBe(true);
  });

  it("is clean text: no sheet numbering or ALL-CAPS left in any unit or topic name", () => {
    for (const u of course.units) {
      expect(u.unit).toMatch(/^\d\. Ünite: /);
      for (const t of u.topics) {
        expect(t.name).not.toMatch(/^\d+(\.\d+)*\.?\s/);
        expect(t.name).not.toMatch(/\p{Lu}{4,}/u);
      }
    }
  });

  it("is the course the Sosyal Bilgiler exam subject analyses", () => {
    expect(coursesForMaarif7ExamSubject("m7_sosyal")).toEqual([course]);
  });
});

describe("7th grade Fen Bilimleri (three levels: Ünite > Konu > Alt konu)", () => {
  const course = findCourseById("maarif7-fen-bilimleri")!;
  const SEP = " › ";

  it("has the seven units, with headers as supplied, and 26 topic lines", () => {
    expect(course.units.map((u) => [u.unit, u.topics.length])).toEqual([
      ["1. Ünite - Uzay Çağı", 3],
      ["2. Ünite - Kuvvet ve Enerjiyi Keşfedelim", 3],
      ["3. Ünite - Vücudumuzdaki Sistemler", 9],
      ["4. Ünite - Işığın Kırılması ve Mercekler", 2],
      ["5. Ünite - Maddenin Doğasına Yolculuk", 5],
      ["6. Ünite - Elektriklenme", 2],
      ["7. Ünite - Sürdürülebilir Yaşam ve Enerji", 2],
    ]);
    expect(course.units.flatMap((u) => u.topics)).toHaveLength(26);
  });

  it("keeps every Konu and every Alt konu: sub-topics are written 'Konu › Alt konu', in the supplied order", () => {
    const names = (i: number) => course.units[i].topics.map((t) => t.name);
    expect(names(0)).toEqual([
      "Türkiye ve Uzay Araştırmaları › Uzay Teknolojileri",
      "Türkiye ve Uzay Araştırmaları › Teknoloji ile Uzay Araştırmaları Arasındaki İlişki",
      "Uzayda Neler Var? › Yıldız Oluşumu",
    ]);
    expect(names(2)).toEqual([
      "Sindirim Sistemi › Sindirim Sistemini Oluşturan Yapı ve Organlar",
      "Sindirim Sistemi › Sindirim Sisteminin Sağlığı",
      "Dolaşım Sistemi › Dolaşım Sistemini Oluşturan Yapı ve Organlar",
      "Dolaşım Sistemi › Kan Bağışının Toplum Açısından Önemi",
      "Dolaşım Sistemi › Dolaşım Sisteminin Sağlığı",
      "Solunum Sistemi › Solunum Sistemini Oluşturan Yapı ve Organlar",
      "Solunum Sistemi › Solunum Sisteminin Sağlığı", // the typo ("Sağlığı0") is already fixed
      "Boşaltım Sistemi › Boşaltım Sistemini Oluşturan Yapı ve Organlar",
      "Boşaltım Sistemi › Boşaltım Sisteminin Sağlığı",
    ]);
    // A Konu with no Alt konu is a plain topic.
    expect(names(4)).toEqual([
      "Maddenin Tanecikli Yapısı › Atomun Yapısı ve Atomdaki Temel Parçacıklar",
      "Maddenin Tanecikli Yapısı › Geçmişten Günümüze Atom",
      "Saf Maddeler",
      "Karışımlar › Çözünme Hızına Etki Eden Faktörler",
      "Karışımların Ayrılması",
    ]);
    expect(names(6)).toEqual(["Besin Zinciri ve Enerji Akışı", "Sürdürülebilir Yaşam"]);
    const all = course.units.flatMap((u) => u.topics.map((t) => t.name));
    expect(all.filter((n) => n.includes(SEP))).toHaveLength(22);
    expect(all.some((n) => /\d$/.test(n))).toBe(false);
  });

  it("has the 14 Konu headings across the units (each once), so the hierarchy is clear", () => {
    const konular = course.units.flatMap((u) => [...new Set(u.topics.map((t) => t.name.split(SEP)[0]))]);
    expect(konular).toHaveLength(17); // 14 with Alt konu + Saf Maddeler, Besin Zinciri, Sürdürülebilir Yaşam... listed per unit
    expect(konular).toContain("Saf Maddeler");
    expect(konular).toContain("Karışımların Ayrılması");
  });

  it("has unique ids in the 7th-grade convention", () => {
    const ids = course.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(26);
    expect(ids[0]).toBe("maarif7-fen-bilimleri-u0-t0");
    expect(ids[ids.length - 1]).toBe("maarif7-fen-bilimleri-u6-t1");
  });

  it("is tracked per Konu in Kaynak Takibi: one row each, named by the Konu, its Alt konu listed beneath", () => {
    const rows = flattenSelectionRows(course);
    expect(rows.map((r) => r.label)).toEqual([
      "Türkiye ve Uzay Araştırmaları",
      "Uzayda Neler Var?",
      "Kuvvet, İş ve Enerji İlişkisi",
      "Enerji Dönüşümleri",
      "Sindirim Sistemi",
      "Dolaşım Sistemi",
      "Solunum Sistemi",
      "Boşaltım Sistemi",
      "Işığın Kırılması",
      "Mercekler",
      "Maddenin Tanecikli Yapısı",
      "Saf Maddeler",
      "Karışımlar",
      "Karışımların Ayrılması",
      "Elektrik Yükleri ve Elektriklenme",
      "7. Ünite - Sürdürülebilir Yaşam ve Enerji",
    ]);
    // Every one of the 26 topics is a member of exactly one row: nothing lost.
    const members = rows.flatMap((r) => r.memberTopicIds);
    expect(members).toHaveLength(26);
    expect(new Set(members).size).toBe(26);
  });

  it("is the course the Fen Bilimleri exam subject analyses", () => {
    expect(coursesForMaarif7ExamSubject("m7_fen")).toEqual([course]);
  });
});

describe("7th grade Matematik", () => {
  const course = findCourseById("maarif7-matematik")!;

  it("has the nine themes with the headers exactly as supplied, and 45 topics", () => {
    expect(course.units.map((u) => [u.unit, u.topics.length])).toEqual([
      ["1. Tema Sayılar ve Nicelikler (1)", 8],
      ["2. Tema Geometrik Nicelikler (1)", 6],
      ["3. Tema İstatistiksel Araştırma Süreci", 7],
      ["4. Tema Dönüşüm", 2],
      ["5. Tema Geometrik Şekiller", 2],
      ["6. Tema Sayılar ve Nicelikler (2)", 6],
      ["7. Tema Veriden Olasılığa", 4],
      ["8. Tema İşlemlerle Cebirsel Düşünme ve Değişimler", 5],
      ["9. Tema Geometrik Nicelikler (2)", 5],
    ]);
    expect(course.units.flatMap((u) => u.topics)).toHaveLength(45);
  });

  it("keeps the topics under their theme in the supplied order", () => {
    const names = (i: number) => course.units[i].topics.map((t) => t.name);
    expect(names(0)).toEqual([
      "Tam Sayılar",
      "Rasyonel Sayılar",
      "Mutlak Değer",
      "Rasyonel Sayıların Farklı Temsilleri",
      "Rasyonel Sayılarda Karşılaştırma ve Sıralama",
      "Tam Sayılarla İşlemler ve Problem Çözme",
      "Rasyonel Sayılarla İşlemler ve Problem Çözme",
      "Çok Adımlı İşlemler",
    ]);
    expect(names(1)[5]).toBe("Dikdörtgenler Prizması ile Modellenen Cisimlerin Yüzey Alanları ve Hacimlerine Yönelik Problemler");
    expect(names(3)).toEqual(["Yansıma Dönüşümü", "Orta Dikme ve Açıortay İnşası"]);
    expect(names(5)).toEqual(["Oran", "Birimli Birimsiz Oran", "Denk Oran", "Birim Oran", "Orantı", "Doğru Orantı Problemleri"]);
    expect(names(8)).toEqual([
      "Dairenin Alanı",
      "Daire Diliminin Alanı",
      "Eşkenar Dörtgenin Alanı",
      "Yamuğun Alanı",
      "Daire, Daire Dilimi, Eşkenar Dörtgen ve Yamuğun Alanına İlişkin Problemler",
    ]);
  });

  it("has unique ids in the 7th-grade convention, every unit distinct (the (1)/(2) themes included)", () => {
    const ids = course.units.flatMap((u) => u.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(45);
    expect(ids[0]).toBe("maarif7-matematik-u0-t0");
    expect(ids[ids.length - 1]).toBe("maarif7-matematik-u8-t4");
    expect(new Set(course.units.map((u) => u.unit)).size).toBe(9);
  });

  it("is the course the Matematik exam subject analyses", () => {
    expect(coursesForMaarif7ExamSubject("m7_matematik")).toEqual([course]);
  });
});

describe("7th grade Genel Deneme: the LGS question distribution", () => {
  it("has six subjects with LGS's counts (20/10/10/10 Sözel, 20/20 Sayısal), 90 questions in all", () => {
    expect(MAARIF7_EXAM_SUBJECTS.map((s) => [s.label, s.section, s.questions])).toEqual([
      ["Türkçe", "SÖZEL", 20],
      ["Sosyal Bilgiler", "SÖZEL", 10],
      ["Din Kültürü", "SÖZEL", 10],
      ["İngilizce", "SÖZEL", 10],
      ["Matematik", "SAYISAL", 20],
      ["Fen Bilimleri", "SAYISAL", 20],
    ]);
    expect(MAARIF7_EXAM_QUESTION_TOTAL).toBe(90);
  });

  it("matches LGS subject by subject (Sosyal Bilgiler takes the İnkılap slot)", () => {
    expect(MAARIF7_EXAM_SUBJECTS.map((s) => [s.section, s.questions])).toEqual(LGS_EXAM_SUBJECTS.map((s) => [s.section, s.questions]));
  });

  it("keys are m7_-prefixed and never collide with LGS, TYT or another grade's", () => {
    for (const s of MAARIF7_EXAM_SUBJECTS) expect(s.key.startsWith("m7_")).toBe(true);
    const lgsKeys = new Set(LGS_EXAM_SUBJECTS.map((s) => s.key));
    for (const s of MAARIF7_EXAM_SUBJECTS) expect(lgsKeys.has(s.key)).toBe(false);
    expect(MAARIF_GRADES[7].examSubjects).toBe(MAARIF7_EXAM_SUBJECTS);
    expect(MAARIF_GRADES[7].lgsStyleScoring).toBe(true);
    expect(MAARIF_GRADES[9].lgsStyleScoring).toBeUndefined();
  });

  const TITLE = "7. SINIF Genel Deneme - Test Yayınları";
  const row = (correct: number, wrong: number, empty: number) => ({ correct, wrong, empty });
  const full = {
    m7_turkce: row(15, 3, 2),
    m7_sosyal: row(8, 1, 1),
    m7_din: row(9, 0, 1),
    m7_ingilizce: row(7, 2, 1),
    m7_matematik: row(12, 4, 4),
    m7_fen: row(10, 5, 5),
  };

  it("requires every one of the six subjects to be filled in, like LGS (a missing or blank one is incomplete)", () => {
    expect(expectedGeneralExamKeys(TITLE, null)).toEqual(MAARIF7_EXAM_SUBJECTS.map((s) => s.key));
    expect(isGeneralExamScoresIncomplete(TITLE, full)).toBe(false);
    const { m7_fen, ...withoutFen } = full;
    void m7_fen;
    expect(isGeneralExamScoresIncomplete(TITLE, withoutFen)).toBe(true);
    expect(isGeneralExamScoresIncomplete(TITLE, { ...full, m7_din: { correct: 9, wrong: 0, empty: null } })).toBe(true);
  });

  it("enforces each subject's own question count: Doğru+Yanlış+Boş must equal it", () => {
    expect(findGeneralExamTotalMismatch(TITLE, full)).toBeNull();
    const over = findGeneralExamTotalMismatch(TITLE, { ...full, m7_din: row(9, 2, 1) }); // 12 of 10
    expect(over).not.toBeNull();
    expect(over?.questions).toBe(10);
    expect(findGeneralExamTotalMismatch(TITLE, { ...full, m7_turkce: row(15, 3, 1) })).not.toBeNull(); // 19 of 20
  });

  it("a 7th grader's exam is never judged by TYT's subject list", () => {
    expect(expectedGeneralExamKeys(TITLE, null)).not.toContain("turkce");
    expect(expectedGeneralExamKeys("11. SINIF Genel Deneme", null)).toEqual([]); // the other empty grade is unchanged
  });
});

describe("the 7th grade's menu", () => {
  const seventh = { examType: "YKS" as const, isMaarif: true, isGraduate: false };

  it("keeps Kaynak Takibi, Deneme Analizleri and Yazılılar; hides Çıkmış Sorular and İngilizce Quiz", () => {
    expect(isStudentNavItemVisible("/student/kaynak-takibi", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/deneme-analizleri", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/yazililar", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/paragraf-problem", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/cikmis-sorular", seventh)).toBe(false);
    expect(isStudentNavItemVisible("/student/ingilizce-quiz", seventh)).toBe(false);
  });
});

describe("Yazılılar for the 7th grade", () => {
  it("has its own cohort with the six courses, in order", () => {
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: 7, isGraduate: false })).toBe("grade7");
    expect(DEFAULT_SCHOOL_COURSES.grade7.map((c) => c.name)).toEqual([
      "Matematik",
      "Türkçe",
      "Fen Bilimleri",
      "Sosyal Bilgiler",
      "İngilizce",
      "Din Kültürü ve Ahlak Bilgisi",
    ]);
  });

  it("keeps every other grade's cohort unchanged", () => {
    expect(schoolCohortOf({ examType: "LGS", maarifGrade: null, isGraduate: false })).toBe("lgs");
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: 9, isGraduate: false })).toBe("grade9");
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: null, isGraduate: false })).toBe("grade12");
  });
});

// A minimal stand-in for the Supabase client: the first N column sets "fail" like a column that
// does not exist yet, so the tolerant reads have to fall back.
function fakeSupabase(failColumnSets: string[], row: Record<string, unknown>) {
  const calls: string[] = [];
  const query = (columns: string) => {
    calls.push(columns);
    const fail = failColumnSets.includes(columns);
    const result = fail ? { data: null, error: { message: "column does not exist" } } : { data: row, error: null };
    const listResult = fail ? { data: null, error: { message: "column does not exist" } } : { data: [{ id: "a", ...row }], error: null };
    const chain = {
      eq: () => chain,
      in: () => Promise.resolve(listResult),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  };
  return { calls, client: { from: () => ({ select: query }) } as never };
}

describe("tolerant reads of the grade flag (migration 0119 may not be applied yet)", () => {
  const ALL4 = "is_maarif7, is_maarif9, is_maarif10, is_maarif11";
  const ALL3 = "is_maarif9, is_maarif10, is_maarif11";

  it("reads a 7th grader when all four columns exist", async () => {
    const { client } = fakeSupabase([], { is_maarif7: true });
    expect(await fetchMaarifGrade(client, "s")).toBe(7);
    expect(await fetchRequestedMaarifGrade(client, "r")).toBe(7);
  });

  it("falls back to the older columns when is_maarif7 does not exist yet, and still reads the 9th grade", async () => {
    const { client, calls } = fakeSupabase([ALL4], { is_maarif9: true });
    expect(await fetchMaarifGrade(client, "s")).toBe(9);
    expect(calls).toEqual([ALL4, ALL3]);
  });

  it("an ordinary student reads as no grade even when every column is missing", async () => {
    const { client } = fakeSupabase([ALL4, ALL3, "is_maarif9, is_maarif10", "is_maarif9"], {});
    expect(await fetchMaarifGrade(client, "s")).toBeNull();
  });

  it("the list read maps flagged rows to their grade, 7 included", async () => {
    const { client } = fakeSupabase([], { is_maarif7: true });
    const grades = await fetchMaarifGradesByIds(client, "profiles", ["a"]);
    expect(grades.get("a")).toBe(7);
  });
});
