// 7th grade ("Türkiye Yüzyılı Maarif Modeli") curriculum -- built up COURSE BY COURSE, as the lists are
// supplied.
//
// The 7th grade is a full grade of the platform (profiles.is_maarif7, migration 0119). Its Kaynak Takibi /
// Konu Çalışması / Deneme Analizi courses are added here one at a time (same Course/Unit/Topic shape as
// ./maarif9, ./maarif10 and ./maarif11), already in the clean title-case wording the lists come in, so no
// sheet-number stripping is needed. A course that has not been supplied yet is simply absent: every consumer
// of MAARIF_GRADES[7] shows a calm "ders listesi hazırlandığında burada görünecek" state for a missing
// course, and the Genel Deneme analysis has no topic table for that subject yet.
//
// Course ids all start with "maarif7-" (isMaarif7CourseId), so a 7th grader can only ever be offered
// 7th-grade courses. The Genel Deneme subject list (LGS question distribution) is MAARIF7_EXAM_SUBJECTS in
// ./subject-groups, whose `courseIds` point at these ids. There is no Çıkmış Sorular data for the 7th grade,
// and none is wanted (no national exam), so that page stays hidden for it.
import type { Course, Unit } from "./index";

// Topic ids follow the other grades' convention: "<course id>-u<unit index>-t<topic index>", 0-based.
function buildCourse(id: string, name: string, units: { unit: string; topics: string[] }[]): Course {
  return {
    id,
    name,
    units: units.map<Unit>((u, ui) => ({
      unit: u.unit,
      topics: u.topics.map((topic, ti) => ({ id: `${id}-u${ui}-t${ti}`, name: topic })),
    })),
  };
}

const SOSYAL_BILGILER = buildCourse("maarif7-sosyal-bilgiler", "7. Sınıf Sosyal Bilgiler", [
  {
    unit: "1. Ünite: Birlikte Yaşamak",
    topics: [
      "Gruplarda ve Sosyal Hayatta İletişimin Önemi",
      "Özel Gereksinimli Bireyler İçin Fırsat Eşitliği",
      "Millî Meseleler Karşısında Türk Toplumunun Tutum ve Davranışları",
    ],
  },
  {
    unit: "2. Ünite: Evimiz Dünya",
    topics: ["Küreselleşmenin İnsan ve Toplum Hayatına Etkisi", "Bölgesel ve Küresel Sorunların Çözümünde Ülkemizin Rolü"],
  },
  {
    unit: "3. Ünite: Ortak Mirasımız",
    topics: [
      "Osmanlı Devleti'nin Cihan Devleti Hâline Gelmesini Sağlayan Politikalar",
      "Osmanlı Devleti'nin Uygulamaya Koyduğu Yenilikler",
      "Osmanlı Kültür ve Medeniyeti",
    ],
  },
  {
    unit: "4. Ünite: Yaşayan Demokrasimiz",
    topics: [
      "Türkiye Cumhuriyeti'nin Nitelikleri",
      "Türkiye Cumhuriyeti'nin Yönetim Yapısı",
      "Ülkemizde Demokrasinin Gelişimi",
      "Demokrasinin Uygulanma Sürecinde Karşılaşılan Sorunlar",
    ],
  },
  {
    unit: "5. Ünite: Hayatımızdaki Ekonomi",
    topics: ["Millî Kalkınma Hamleleri", "Ekonomik Gelişmişlik ile Üretim, Dağıtım ve Tüketim Arasındaki Döngü"],
  },
  {
    unit: "6. Ünite: Teknoloji ve Sosyal Bilimler",
    topics: [
      "Bilimsel ve Teknolojik Gelişmelerin Gelecekteki Hayata Etkisi",
      "Sosyal Bilimlerin Çalışma Alanları",
      "Toplumsal Hayatta Karşılaşılabilecek Problemlere Çözüm Üretme",
    ],
  },
]);

export const MAARIF7_KAYNAK_COURSES: Course[] = [SOSYAL_BILGILER];

export function isMaarif7CourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif7-");
}
