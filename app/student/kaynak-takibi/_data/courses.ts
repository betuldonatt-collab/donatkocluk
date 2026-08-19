// Konu listeleri henüz resmi müfredattan gelmedi. "Asla kafandan konu
// uydurma" kuralı gereği, kullanıcının mesajında birebir verdiği örnekler
// dışında hiçbir konu adı uydurulmadı — geri kalanı PLACEHOLDER olarak
// işaretli. Gerçek liste paylaşılınca yalnızca bu dosya güncellenecek.
export type Course = {
  id: string;
  name: string;
  topics: string[];
};

const PLACEHOLDER_TOPICS = ["PLACEHOLDER Konu 1", "PLACEHOLDER Konu 2", "PLACEHOLDER Konu 3"];

function course(id: string, name: string, topics: string[] = PLACEHOLDER_TOPICS): Course {
  return { id, name, topics };
}

// Kullanıcının mesajında verilen sabit TYT ders listesi.
export const TYT_COURSES: Course[] = [
  // Konular kullanıcının mesajında birebir örnek olarak verildi.
  course("tyt-turkce", "Türkçe", ["Sözcükte Anlam", "Cümlede Anlam", "Paragrafta Anlam"]),
  course("tyt-matematik", "Matematik", ["Temel Kavramlar", "Bölme-Bölünebilme"]),
  // Konu listesi verilmedi — PLACEHOLDER.
  course("tyt-geometri", "Geometri"),
  course("tyt-fizik", "Fizik"),
  course("tyt-kimya", "Kimya"),
  course("tyt-biyoloji", "Biyoloji"),
  course("tyt-tarih", "Tarih"),
  course("tyt-cografya", "Coğrafya"),
  course("tyt-felsefe", "Felsefe"),
  course("tyt-din", "Din Kültürü ve Ahlak Bilgisi"),
];

export type Track = "sayisal" | "ea" | "sozel";

export const TRACK_LABELS: Record<Track, string> = {
  sayisal: "Sayısal",
  ea: "Eşit Ağırlık",
  sozel: "Sözel",
};

// Kullanıcının mesajındaki örnekler kullanıldı (Sayısal, Sözel). Eşit
// Ağırlık için hiç örnek verilmedi — tek PLACEHOLDER ders ile bekletiliyor.
// Konu listelerinin tamamı PLACEHOLDER; kullanıcı "tam listeyi ben
// vereceğim" dedi.
export const AYT_COURSES_BY_TRACK: Record<Track, Course[]> = {
  sayisal: [
    course("ayt-say-matematik", "Matematik"),
    course("ayt-say-fizik", "Fizik"),
    course("ayt-say-kimya", "Kimya"),
    course("ayt-say-biyoloji", "Biyoloji"),
  ],
  sozel: [
    course("ayt-soz-edebiyat", "Edebiyat"),
    course("ayt-soz-tarih1", "Tarih-1"),
    course("ayt-soz-cografya1", "Coğrafya-1"),
  ],
  ea: [course("ayt-ea-placeholder", "PLACEHOLDER Ders")],
};
