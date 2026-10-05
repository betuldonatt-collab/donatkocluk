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

// Three levels: Ünite -> Konu -> Alt konu. The curriculum model has two (unit -> topic), so a sub-topic is
// written "Konu › Alt konu" -- the same convention the 9th/10th grade's headed topics use: Kaynak Takibi
// shows each Konu once as a heading with its sub-topics beneath it, and a Konu with no sub-topic is a plain
// row. Unit headers are kept exactly as supplied ("1. Ünite - Uzay Çağı").
const FEN_BILIMLERI = buildCourse("maarif7-fen-bilimleri", "7. Sınıf Fen Bilimleri", [
  {
    unit: "1. Ünite - Uzay Çağı",
    topics: [
      "Türkiye ve Uzay Araştırmaları › Uzay Teknolojileri",
      "Türkiye ve Uzay Araştırmaları › Teknoloji ile Uzay Araştırmaları Arasındaki İlişki",
      "Uzayda Neler Var? › Yıldız Oluşumu",
    ],
  },
  {
    unit: "2. Ünite - Kuvvet ve Enerjiyi Keşfedelim",
    topics: [
      "Kuvvet, İş ve Enerji İlişkisi › Fiziksel Anlamda İş",
      "Kuvvet, İş ve Enerji İlişkisi › Enerji ve Enerji Çeşitleri",
      "Enerji Dönüşümleri › Enerjinin Korunumu",
    ],
  },
  {
    unit: "3. Ünite - Vücudumuzdaki Sistemler",
    topics: [
      "Sindirim Sistemi › Sindirim Sistemini Oluşturan Yapı ve Organlar",
      "Sindirim Sistemi › Sindirim Sisteminin Sağlığı",
      "Dolaşım Sistemi › Dolaşım Sistemini Oluşturan Yapı ve Organlar",
      "Dolaşım Sistemi › Kan Bağışının Toplum Açısından Önemi",
      "Dolaşım Sistemi › Dolaşım Sisteminin Sağlığı",
      "Solunum Sistemi › Solunum Sistemini Oluşturan Yapı ve Organlar",
      "Solunum Sistemi › Solunum Sisteminin Sağlığı",
      "Boşaltım Sistemi › Boşaltım Sistemini Oluşturan Yapı ve Organlar",
      "Boşaltım Sistemi › Boşaltım Sisteminin Sağlığı",
    ],
  },
  {
    unit: "4. Ünite - Işığın Kırılması ve Mercekler",
    topics: ["Işığın Kırılması › Kırılma Kanunları", "Mercekler › Merceklerin Günlük Hayatta Kullanım Alanları"],
  },
  {
    unit: "5. Ünite - Maddenin Doğasına Yolculuk",
    topics: [
      "Maddenin Tanecikli Yapısı › Atomun Yapısı ve Atomdaki Temel Parçacıklar",
      "Maddenin Tanecikli Yapısı › Geçmişten Günümüze Atom",
      "Saf Maddeler",
      "Karışımlar › Çözünme Hızına Etki Eden Faktörler",
      "Karışımların Ayrılması",
    ],
  },
  {
    unit: "6. Ünite - Elektriklenme",
    topics: [
      "Elektrik Yükleri ve Elektriklenme › Elektriklenmenin Teknolojideki Kullanımı",
      "Elektrik Yükleri ve Elektriklenme › Elektriklenme Çeşitleri",
    ],
  },
  {
    unit: "7. Ünite - Sürdürülebilir Yaşam ve Enerji",
    topics: ["Besin Zinciri ve Enerji Akışı", "Sürdürülebilir Yaşam"],
  },
]);

// The id the Din Kültürü exam subject (m7_din) analyses (MAARIF7_EXAM_SUBJECTS in ./subject-groups).
const DIN_KULTURU = buildCourse("maarif7-din-kulturu-ve-ahlak-bilgisi", "7. Sınıf Din Kültürü ve Ahlak Bilgisi", [
  {
    unit: "1. Ünite: Melek ve Ahiret İnancı",
    topics: [
      "Varlıklar Âlemi",
      "Dünya ve Ahiret Hayatı",
      "Melek ve Ahiret İnancının İnsana Kazandırdıkları",
      "Bir Sure Öğreniyorum: Nas Suresi",
    ],
  },
  {
    unit: "2. Ünite: Hac, Umre ve Kurban",
    topics: [
      "Hac ve Umre İbadeti",
      "Kurban İbadeti",
      "Hac ve Kurban İbadetinin Kültürümüze Yansımaları",
      "Bir Sure Öğreniyorum: Kafirun Suresi",
    ],
  },
  {
    unit: "3. Ünite: İslam Düşüncesinde Yorumlar",
    topics: [
      "Din Anlayışındaki Yorum Farklılıkları",
      "İslam Düşüncesinde Yorum Biçimleri",
      "Kültürümüzdeki Tasavvufi Yorumlar",
      "Alevilik Bektaşilik ile İlgili Temel Kavramlar ve Cem Erkanları",
    ],
  },
  {
    unit: "4. Ünite: Peygamber Olarak Hz. Muhammed",
    topics: [
      "Hz. Muhammed'in (s.a.v.) Daveti: Mekke Dönemi",
      "Hicret",
      "Hz. Muhammed'in (s.a.v.) Daveti: Medine Dönemi",
      "Bir Sure Öğreniyorum: Nasr Suresi",
    ],
  },
  {
    unit: "5. Ünite: Yaşayan Dünya Dinleri",
    topics: ["Yahudilik", "Hristiyanlık", "Hinduizm", "Budizm"],
  },
]);

// İngilizce has only Themes, no sub-topics. Each Theme is both the unit (header exactly as supplied,
// "Theme 1: School Life & Education") and its single topic (the Theme's title), so the split layout works
// as for any other course: one topic line to tick Okul İlerlemesi / Konu Çalışması on, and the resource
// ticks once on the unit. The id is the one the İngilizce exam subject (m7_ingilizce) analyses.
const INGILIZCE_THEMES = [
  "School Life & Education",
  "Classroom Life & Learning",
  "Personal Life & Well-Being",
  "Family Life & Home",
  "Life in the Neighbourhood, City & Social Life",
  "Life in the World & Culture",
  "Life in Nature & Global Problems",
  "Life in the Universe & Future",
];
const INGILIZCE = buildCourse(
  "maarif7-ingilizce",
  "7. Sınıf İngilizce",
  INGILIZCE_THEMES.map((title, i) => ({ unit: `Theme ${i + 1}: ${title}`, topics: [title] })),
);

// Türkçe: six Temas, three topics each, headers and topic wording exactly as supplied (the parenthesised
// sub-lists are part of the topic name). The id is the one the Türkçe exam subject (m7_turkce) analyses.
const TURKCE = buildCourse("maarif7-turkce", "7. Sınıf Türkçe", [
  {
    unit: "1. Tema: Hayat Boyu Gelişim",
    topics: [
      "Sözcükte Anlam (Gerçek, Mecaz, Terim Anlam)",
      "Parçada Anlam (Ana Düşünce ve Yardımcı Düşünce)",
      "Fiillerde Anlam Özellikleri (İş, Oluş, Durum Fiilleri)",
    ],
  },
  {
    unit: "2. Tema: Bir Hilal Uğruna",
    topics: [
      "Sözcükler Arası Anlam İlişkileri (Eş, Zıt, Eş Sesli)",
      "Fiillerde Kip (Haber ve Dilek Kipleri)",
      "Fiillerde Kişi ve Çekim",
    ],
  },
  {
    unit: "3. Tema: İletişim ve Sosyal İlişkiler",
    topics: [
      "Cümlede Anlam İlişkileri (Neden-Sonuç, Amaç-Sonuç, Koşul)",
      "Fiillerde Anlam (Zaman) Kayması",
      "Fiilde Yapı (Basit, Türemiş ve Birleşik Fiiller)",
    ],
  },
  {
    unit: "4. Tema: Türk Sanatı",
    topics: [
      "Deyimler ve Atasözleri",
      "Söz Sanatları (Kişileştirme, Konuşturma, Benzetme, Abartma)",
      "Ek Fiil (İsimleri Yüklem Yapma ve Birleşik Zamanlı Fiil)",
    ],
  },
  {
    unit: "5. Tema: Okuma Kültürü",
    topics: [
      "Metin Türleri (Hikâye, Masal, Fabl, Roman vb.)",
      "Anlatım Biçimleri ve Düşünceyi Geliştirme Yolları",
      "Zarflar (Durum, Zaman, Miktar, Yer-Yön, Soru Zarfları)",
    ],
  },
  {
    unit: "6. Tema: Hak ve Sorumluluklar",
    topics: [
      "Örtülü Anlam ve Cümle Yorumlama",
      "Yazım Kuralları ve Noktalama İşaretleri",
      "Anlatım Bozuklukları (Anlama Dayalı Bozukluklar)",
    ],
  },
]);

// In the LGS order: the four SÖZEL courses first (Türkçe, Sosyal Bilgiler, Din Kültürü, İngilizce), then the two
// SAYISAL ones (Matematik, Fen Bilimleri). Every flat list (course pickers, the first course selected by
// default) therefore reads Sözel-first like LGS's; MAARIF7_SUBJECT_GROUPS (./subject-groups) names the sections.
export const MAARIF7_KAYNAK_COURSES: Course[] = [TURKCE, SOSYAL_BILGILER, DIN_KULTURU, INGILIZCE, MATEMATIK, FEN_BILIMLERI];

export function isMaarif7CourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif7-");
}
