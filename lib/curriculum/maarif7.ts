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

// Theme headers are kept exactly as supplied ("1. Tema Sayılar ve Nicelikler (1)").
const MATEMATIK = buildCourse("maarif7-matematik", "7. Sınıf Matematik", [
  {
    unit: "1. Tema Sayılar ve Nicelikler (1)",
    topics: [
      "Tam Sayılar",
      "Rasyonel Sayılar",
      "Mutlak Değer",
      "Rasyonel Sayıların Farklı Temsilleri",
      "Rasyonel Sayılarda Karşılaştırma ve Sıralama",
      "Tam Sayılarla İşlemler ve Problem Çözme",
      "Rasyonel Sayılarla İşlemler ve Problem Çözme",
      "Çok Adımlı İşlemler",
    ],
  },
  {
    unit: "2. Tema Geometrik Nicelikler (1)",
    topics: [
      "Cisimlerin Farklı Yönlerden Görünümleri",
      "Dikdörtgenler Prizmasının Açınımı ve Yüzey Alanı",
      "Hacmi Eş Nesneler Aracılığıyla Yorumlama",
      "Dikdörtgenler Prizmasının Hacim Bağıntısını Elde Etme",
      "Hacim Ölçme Birimleri",
      "Dikdörtgenler Prizması ile Modellenen Cisimlerin Yüzey Alanları ve Hacimlerine Yönelik Problemler",
    ],
  },
  {
    unit: "3. Tema İstatistiksel Araştırma Süreci",
    topics: [
      "Kategorik ve Nicel Veri Dağılımları",
      "İstatistiksel Araştırma Süreci Adımları",
      "Araştırma Sorusunu Belirleme",
      "Verileri Toplama ve Analize Hazırlama",
      "Veri Analizi (Görselleştirme ve Özetleme)",
      "Veriyi Yorumlama ve Karar Verme",
      "İstatistiksel Araştırma Süreçlerinin İncelenmesi",
    ],
  },
  {
    unit: "4. Tema Dönüşüm",
    topics: ["Yansıma Dönüşümü", "Orta Dikme ve Açıortay İnşası"],
  },
  {
    unit: "5. Tema Geometrik Şekiller",
    topics: ["Üçgende Açıortay, Yükseklik, Kenar Orta Dikme ve Kenarortay", "Üçgende Kenarortay ve İnşası"],
  },
  {
    unit: "6. Tema Sayılar ve Nicelikler (2)",
    topics: ["Oran", "Birimli Birimsiz Oran", "Denk Oran", "Birim Oran", "Orantı", "Doğru Orantı Problemleri"],
  },
  {
    unit: "7. Tema Veriden Olasılığa",
    topics: ["Teorik Olasılık", "Tümleyen Olay", "Eşit Olasılıklı Olaylar", "Ayrık ve Ayrık Olmayan Olaylar"],
  },
  {
    unit: "8. Tema İşlemlerle Cebirsel Düşünme ve Değişimler",
    topics: ["Cebirsel İfadelerle İşlemler", "Denklemler", "Eşitsizlikler", "İspat", "Algoritmayı Yapılandırma"],
  },
  {
    unit: "9. Tema Geometrik Nicelikler (2)",
    topics: [
      "Dairenin Alanı",
      "Daire Diliminin Alanı",
      "Eşkenar Dörtgenin Alanı",
      "Yamuğun Alanı",
      "Daire, Daire Dilimi, Eşkenar Dörtgen ve Yamuğun Alanına İlişkin Problemler",
    ],
  },
]);

export const MAARIF7_KAYNAK_COURSES: Course[] = [MATEMATIK, SOSYAL_BILGILER];

export function isMaarif7CourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif7-");
}
