// The coach's holistic structure for the 11th grade's "Maarif TYT" subjects:
// units, and under each unit its buckets, each bucket rolled up from the raw
// 9th/10th grade topics. One spec per subject.
//
// THE BUCKETS ARE THE LEAVES. A subject with a spec is laid out in its buckets
// everywhere an 11th grader (or their coach) sees it -- Kaynak Takibi, the
// Deneme/Branş analysis tables and mistake picker, Çıkmış Sorular: each bucket
// is one row with one set of checkboxes / one X, and the raw 9th/10th topics
// inside it are never listed. They only live on as the bucket's hidden members
// (Unit.topics, real ids) so what is saved still lands on real topic ids: a
// bucket's tracking is written against its first member's id, and read back
// from all of them.
//
// It only READS the 9th/10th data (maarif9.json / maarif10.json are never
// modified, nor are the 9th/10th graders' own courses). A topic no bucket claims
// is never dropped: it becomes a leaf of its own (see alignedUnits).
import type { Course, Topic, Unit } from "./index";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";

// Where a bucket's topics come from: a unit of a 9th/10th grade course
// (1-based, in the course's own unit order), either all of it or only some
// topics, named by title (the last " › " part of the topic's name) or by
// 1-based position in that unit.
export type Source = { course: string; unit: number; topics?: (string | number)[] };
// `group` is the bucket's intermediate heading within its unit (consecutive
// buckets with the same group share one heading row).
export type BucketSpec = { label: string; from: Source[]; group?: string };
export type UnitSpec = { label: string; buckets: BucketSpec[] };
export type SubjectSpec = {
  units: UnitSpec[];
  // Raw topics the coach's list has no place for, left OUT of the structure on
  // purpose (never shown, never tracked). Everything else a bucket does not
  // claim is still kept, as a leaf of its own (see alignedUnits) -- so a topic
  // only disappears when it is named here.
  excluded?: Source[];
  // True for a subject cut out of a bigger course (Geometri, from Matematik): the
  // spec names the units it takes and ignores the rest of the source courses,
  // instead of keeping every other topic of those courses as a leftover leaf.
  onlyListedUnits?: boolean;
};

export const SUBJECT_SPECS: Record<string, SubjectSpec> = {
  "maarif-tyt-cografya": {
    units: [
      {
        label: "1. Ünite: Coğrafyanın Doğası",
        buckets: [
          { label: "Coğrafya Bilimi", from: [{ course: "maarif9-cografya", unit: 1 }] },
          { label: "Coğrafi Bakış", from: [{ course: "maarif10-cografya", unit: 1 }] },
        ],
      },
      {
        label: "2. Ünite: Mekânsal Bilgi Teknolojileri",
        buckets: [
          {
            label: "Harita Okuryazarlığı",
            from: [{ course: "maarif9-cografya", unit: 2, topics: ["Mekânın Sembolik Dili: Harita", "Türkiye’nin Coğrafi Konumu"] }],
          },
          {
            label: "Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları",
            from: [
              { course: "maarif9-cografya", unit: 2, topics: ["Mekânsal Bilgi Teknolojilerinin Bileşenleri"] },
              { course: "maarif10-cografya", unit: 2 },
            ],
          },
        ],
      },
      {
        label: "3. Ünite: Doğal Sistemler ve Süreçler",
        buckets: [
          { label: "İklim Sistemi", from: [{ course: "maarif9-cografya", unit: 3 }] },
          { label: "Yeryüzünün Şekillenmesi", from: [{ course: "maarif10-cografya", unit: 3 }] },
        ],
      },
      {
        label: "4. Ünite: Beşerî Sistemler ve Süreçler",
        buckets: [
          { label: "Nüfus Dinamikleri", from: [{ course: "maarif9-cografya", unit: 4 }] },
          { label: "Yerleşme", from: [{ course: "maarif10-cografya", unit: 4 }] },
        ],
      },
      {
        label: "5. Ünite: Ekonomik Faaliyetler ve Etkileri",
        buckets: [
          { label: "Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler", from: [{ course: "maarif9-cografya", unit: 5 }] },
          { label: "Ekonomik Faaliyetler ve Sektörel Yapı", from: [{ course: "maarif10-cografya", unit: 5 }] },
        ],
      },
      {
        label: "6. Ünite: Afetler ve Sürdürülebilir Çevre",
        buckets: [
          { label: "Afetler", from: [{ course: "maarif9-cografya", unit: 6 }] },
          { label: "Afetlerle Mücadele", from: [{ course: "maarif10-cografya", unit: 6 }] },
        ],
      },
      {
        label: "7. Ünite: Bölgeler, Ülkeler ve Küresel Bağlantılar",
        buckets: [
          { label: "Bölge ve Bölge Sınırı", from: [{ course: "maarif9-cografya", unit: 7 }] },
          { label: "Türk Kültürünün Mekânsal Özellikleri", from: [{ course: "maarif10-cografya", unit: 7 }] },
        ],
      },
    ],
  },

  // Tarih: units 1-3 are 9th grade's, 4-6 are 10th grade's. Topics are picked
  // by position (the coach's wording differs slightly from the raw titles);
  // the raw title is noted beside each. The structure is also Kaynak Takibi's.
  "maarif-tyt-tarih": {
    units: [
      {
        label: "1. Ünite: Geçmişin İnşa Sürecinde Tarih",
        buckets: [
          { label: "Tarih Öğrenmenin Faydaları", from: [{ course: "maarif9-tarih", unit: 1, topics: [1] }] },
          { label: "Tarihin Doğası", from: [{ course: "maarif9-tarih", unit: 1, topics: [2] }] },
          {
            // 3: Tarihsel Bilginin Üretim Süreci, 4: Tarih Araştırma ve Yazımında Dijital Dönüşüm
            label: "Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm",
            from: [{ course: "maarif9-tarih", unit: 1, topics: [3, 4] }],
          },
        ],
      },
      {
        label: "2. Ünite: Eski Çağ Medeniyetleri",
        buckets: [
          { label: "Tarım Devrimi'nin Eski Çağ'a Etkileri", from: [{ course: "maarif9-tarih", unit: 2, topics: [1] }] },
          { label: "Eski Çağ'da Yönetenler ve Savaşanlar", from: [{ course: "maarif9-tarih", unit: 2, topics: [2] }] },
          { label: "Eski Çağ'da Hukuk", from: [{ course: "maarif9-tarih", unit: 2, topics: [3] }] },
          { label: "Eski Çağ'da İnanç, Bilim ve Sanat", from: [{ course: "maarif9-tarih", unit: 2, topics: [4] }] },
          { label: "Türklerde Konargöçer Yaşam", from: [{ course: "maarif9-tarih", unit: 2, topics: [5] }] },
        ],
      },
      {
        label: "3. Ünite: Orta Çağ Medeniyetleri",
        buckets: [
          { label: "Orta Çağ'daki Kitlesel Göçler ve Avrupa Hun Devleti", from: [{ course: "maarif9-tarih", unit: 3, topics: [1] }] },
          { label: "Orta Çağ'daki Siyasi ve Askeri Gelişmeler", from: [{ course: "maarif9-tarih", unit: 3, topics: [2] }] },
          { label: "Orta Çağ'da Ticaret Yolları", from: [{ course: "maarif9-tarih", unit: 3, topics: [3] }] },
          { label: "Orta Çağ'da Bilim, Kültür ve Sanat", from: [{ course: "maarif9-tarih", unit: 3, topics: [4] }] },
        ],
      },
      {
        label: "4. Ünite: Türkistan'dan Türkiye'ye (1040-1299)",
        buckets: [
          { label: "Önemli Askeri Mücadelelerin Türk Tarihinin Seyrine Etkileri", from: [{ course: "maarif10-tarih", unit: 1, topics: [1] }] },
          { label: "Türkistan'dan Türkiye'ye Türklerde Devlet ve Ordu Teşkilatları", from: [{ course: "maarif10-tarih", unit: 1, topics: [2] }] },
          { label: "Türklerde Sosyoekonomik Hayat ve Şehirleşme", from: [{ course: "maarif10-tarih", unit: 1, topics: [3] }] },
          { label: "Türk-İslam Medeniyetinde Bilim, Kültür, Eğitim ve Sanat", from: [{ course: "maarif10-tarih", unit: 1, topics: [4] }] },
        ],
      },
      {
        label: "5. Ünite: Beylikten Devlete Osmanlı (1299 - 1453)",
        buckets: [
          { label: "Osmanlı Devleti'nin Kuruluşuna Dair Görüşler", from: [{ course: "maarif10-tarih", unit: 2, topics: [1] }] },
          { label: "Beylikten Devlete Siyasi ve Askerî Gelişmeler", from: [{ course: "maarif10-tarih", unit: 2, topics: [2] }] },
          { label: "Osmanlı Devleti'nin İskân ve İstimâlet Politikası", from: [{ course: "maarif10-tarih", unit: 2, topics: [4] }] },
          { label: "Osmanlı Devleti'nde Ordu, Hukuk ve Toprak Sistemi", from: [{ course: "maarif10-tarih", unit: 2, topics: [3] }] },
          { label: "Osmanlı Devleti'nin İlim ve İrfan Geleneği", from: [{ course: "maarif10-tarih", unit: 2, topics: [5] }] },
        ],
      },
      {
        label: "6. Ünite: Cihan Devleti Osmanlı (1453 - 1683)",
        buckets: [
          { label: "Osmanlı Devleti'nin Cihan Devleti Hâline Gelmesi", from: [{ course: "maarif10-tarih", unit: 3, topics: [1] }] },
          { label: "Osmanlı Devleti'nin Yönetim ve Ordu Yapısında Değişim", from: [{ course: "maarif10-tarih", unit: 3, topics: [2] }] },
          { label: "Avrupalıların Sömürgeci Politikaları", from: [{ course: "maarif10-tarih", unit: 3, topics: [3] }] },
          { label: "Osmanlı Devleti'nde İsyanlar", from: [{ course: "maarif10-tarih", unit: 3, topics: [4] }] },
          { label: "Osmanlı Devleti'nde Bilim, Kültür, Eğitim ve Sanat", from: [{ course: "maarif10-tarih", unit: 3, topics: [5] }] },
        ],
      },
    ],
  },

  // Biyoloji: Tema 1-2 are 9th grade's two themes, Tema 3-4 are 10th grade's two units.
  // Topics are picked by 1-based position in the raw unit, and ONLY ones that match a
  // bucket of the coach's list are placed. The raw topics the list has no place for are
  // `excluded` below -- dropped from the structure, not attached to a nearby bucket.
  //  - Komünite and Popülasyon Ekolojisi are ONE raw topic ("Komünitelerde ve Popülasyonlarda
  //    Görülen Etkileşimler ve Değişimler"), and a bucket needs a real topic id of its own, so
  //    they are a single bucket (approved).
  //  - Kept on purpose: "Canlılık İçin Enerjinin Önemi" is the only raw topic for Enerji Molekülü
  //    ATP (without it that bucket would have nothing to track); "Fotosentezde Kullanılan ve
  //    Üretilen Maddeler" is part of Fotosentez Reaksiyonları; "Canlıların Biyolojik Çeşitlilik
  //    Veri Tabanı" is biodiversity content (the last bucket).
  "maarif-tyt-biyoloji": {
    units: [
      {
        label: "1. Tema: Yaşam",
        buckets: [
          { label: "Biyoloji Bilimi ve Bilimsel Araştırma Süreçleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [1, 2, 3] }] },
          { label: "Canlıların Ortak Özellikleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }] },
          { label: "Virüsler", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [15] }] },
          { label: "Canlıların Sınıflandırılması", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [16] }] },
          { label: "Bakteri ve Arke Âlemleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [17, 18] }] },
          { label: "Protista ve Bitki Âlemleri", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [20, 21] }] },
          { label: "Mantarlar Âlemi", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [22] }] },
          { label: "Omurgasız Hayvanlar", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [24] }] },
          { label: "Omurgalı Hayvanlar ve Biyoçeşitlilik", from: [{ course: "maarif9-biyoloji", unit: 1, topics: [25, 26, 27] }] },
        ],
      },
      {
        label: "2. Tema: Organizasyon",
        buckets: [
          { label: "İnorganik Moleküller", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [1, 2] }] },
          { label: "Karbohidratlar", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [3] }] },
          { label: "Lipitler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [4] }] },
          { label: "Proteinler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [5] }] },
          { label: "Enzimler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [6] }] },
          { label: "Nükleik Asitler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [7] }] },
          { label: "Vitaminler", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [8, 9] }] },
          { label: "Hücre ve Alt Birimleri - I", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [11, 12] }] },
          { label: "Hücre ve Alt Birimleri - II", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [13] }] },
          { label: "Difüzyon ve Ozmoz", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [15] }] },
          { label: "Aktif Taşıma, Endositoz ve Ekzositoz", from: [{ course: "maarif9-biyoloji", unit: 2, topics: [14] }] },
        ],
      },
      {
        label: "3. Tema: Enerji",
        buckets: [
          { label: "Enerji Molekülü ATP", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [1] }] },
          { label: "Fotosentez Reaksiyonları", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [2, 3] }] },
          { label: "Fotosentez Hızını Etkileyen Faktörler ve Kemosentez", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [4] }] },
          { label: "Canlılarda Sindirim", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [5] }] },
          { label: "İnsanda Sindirim", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [6] }] },
          { label: "Oksijenli Solunum", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [7, 8] }] },
          { label: "Fermantasyon ve Beslenme", from: [{ course: "maarif10-biyoloji", unit: 1, topics: [9] }] },
        ],
      },
      {
        label: "4. Tema: Ekoloji",
        buckets: [
          { label: "Ekosistemin Bileşenleri", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [1] }] },
          { label: "Komünite ve Popülasyon Ekolojisi", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [2] }] },
          { label: "Ekosistemde Madde ve Enerji Akışı", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [3] }] },
          { label: "Madde Döngüleri", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [4] }] },
          { label: "Ekolojik Sürdürülebilirlik", from: [{ course: "maarif10-biyoloji", unit: 2, topics: [5, 6, 7, 8, 9] }] },
        ],
      },
    ],
    excluded: [
      // 9th grade, 1. Tema: "Sınıflandırmada Üç Üst Âlem Sistemi › Biyolojik Sınıflandırma Sistemi › Ökaryotlar" (19)
      // and "... › Ökaryotik Canlıların Sınıflandırılması › Hayvanlar" (23)
      { course: "maarif9-biyoloji", unit: 1, topics: [19, 23] },
      // 9th grade, 2. Tema: "Organik Moleküllerin Tayininde Kullanılan Ayıraçlar" (10) and
      // "Hücre, Doku, Organ ve Sistemlerin Organizasyonu" (16)
      { course: "maarif9-biyoloji", unit: 2, topics: [10, 16] },
      // 10th grade, Enerji: "Besinlerden Enerjiye › Enerji-Metabolizma İlişkisi" (10)
      { course: "maarif10-biyoloji", unit: 1, topics: [10] },
    ],
  },

  // Kimya: Tema 1-3 are 9th grade's three themes, Tema 4-6 are 10th grade's three units.
  // Three levels: Tema -> intermediate group ("Kimya Hayattır", ...) -> bucket (the leaf).
  // Topics are picked by 1-based position in the raw unit and ONLY ones that match a bucket of
  // the coach's list are placed; the rest are `excluded` (dropped, never attached nearby).
  //  - Tema 4 "Kinetik Moleküler Teori, Difüzyon ve Efüzyon" takes both raw Gazlar topics (7, 9).
  "maarif-tyt-kimya": {
    units: [
      {
        label: "1. Tema: Etkileşim",
        buckets: [
          { label: "Günlük Hayatta Kimya", group: "Kimya Hayattır", from: [{ course: "maarif9-kimya", unit: 1, topics: [1] }] },
          { label: "Kimyanın Alt Disiplinleri", group: "Kimya Hayattır", from: [{ course: "maarif9-kimya", unit: 1, topics: [2] }] },
          { label: "Kimyasal Maddelerin Kullanımı ve Güvenlik", group: "Kimya Hayattır", from: [{ course: "maarif9-kimya", unit: 1, topics: [4] }] },
          { label: "Atom Teorileri, Atomun Yapısı", group: "Atomdan Periyodik Tabloya", from: [{ course: "maarif9-kimya", unit: 1, topics: [5] }] },
          { label: "Atom Orbitalleri ve Elektron Dizilimi", group: "Atomdan Periyodik Tabloya", from: [{ course: "maarif9-kimya", unit: 1, topics: [6] }] },
          { label: "Periyodik Tabloda Yer Bulma", group: "Atomdan Periyodik Tabloya", from: [{ course: "maarif9-kimya", unit: 1, topics: [7] }] },
          { label: "Periyodik Özellikler", group: "Atomdan Periyodik Tabloya", from: [{ course: "maarif9-kimya", unit: 1, topics: [8] }] },
        ],
      },
      {
        label: "2. Tema: Çeşitlilik",
        buckets: [
          { label: "Metalik Bağ", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [1] }] },
          { label: "İyonik Bağ", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [2] }] },
          { label: "Kovalent Bağ", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [3] }] },
          { label: "Lewis Nokta Yapısı", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [4] }] },
          { label: "Molekül Polarlığı ve Apolarlığı", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [5] }] },
          { label: "Bileşiklerin Adlandırılması", group: "Etkileşimler", from: [{ course: "maarif9-kimya", unit: 2, topics: [6] }] },
          { label: "Moleküller Arası Etkileşimler", group: "Etkileşimden Maddeye", from: [{ course: "maarif9-kimya", unit: 2, topics: [7] }] },
          { label: "Katılar ve Özellikleri", group: "Etkileşimden Maddeye", from: [{ course: "maarif9-kimya", unit: 2, topics: [8] }] },
          { label: "Sıvılar ve Özellikleri", group: "Etkileşimden Maddeye", from: [{ course: "maarif9-kimya", unit: 2, topics: [9] }] },
        ],
      },
      {
        label: "3. Tema: Sürdürülebilirlik",
        buckets: [
          { label: "Metal Nanoparçacıklar", group: "Nanoparçacıklar ve Ekolojik Sürdürülebilirlik", from: [{ course: "maarif9-kimya", unit: 3, topics: [1] }] },
          { label: "Yeşil Kimyanın Atık Önleme İlkesi", group: "Nanoparçacıklar ve Ekolojik Sürdürülebilirlik", from: [{ course: "maarif9-kimya", unit: 3, topics: [2] }] },
        ],
      },
      {
        label: "4. Tema: Etkileşim",
        buckets: [
          { label: "Kimyasal Tepkimelerin Oluşumu", group: "Kimyasal Tepkimeler", from: [{ course: "maarif10-kimya", unit: 1, topics: [1] }] },
          { label: "Kimyasal Tepkime Türleri (Çökelme Tepkimeleri)", group: "Kimyasal Tepkimeler", from: [{ course: "maarif10-kimya", unit: 1, topics: [2] }] },
          { label: "Mol Kavramı", group: "Kimyasal Tepkimeler", from: [{ course: "maarif10-kimya", unit: 1, topics: [3] }] },
          { label: "Kimyasal Tepkime Denklemlerinin Denkleştirilmesi", group: "Kimyasal Tepkimeler", from: [{ course: "maarif10-kimya", unit: 1, topics: [4] }] },
          { label: "Kimyasal (Stokiyometrik) Hesaplamalar", group: "Kimyasal Tepkimeler", from: [{ course: "maarif10-kimya", unit: 1, topics: [5] }] },
          { label: "Gazların Özellikleri ve Gaz Yasaları", group: "Gazlar", from: [{ course: "maarif10-kimya", unit: 1, topics: [6] }] },
          { label: "İdeal Gaz Yasası", group: "Gazlar", from: [{ course: "maarif10-kimya", unit: 1, topics: [8] }] },
          { label: "Gazların Kinetik Moleküler Teorisi, Difüzyon ve Efüzyon Yasası", group: "Gazlar", from: [{ course: "maarif10-kimya", unit: 1, topics: [7, 9] }] },
        ],
      },
      {
        label: "5. Tema: Çeşitlilik",
        buckets: [
          { label: "Çözünme Süreci", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [1] }] },
          { label: "Maddelerin Birbiri İçinde Çözünebilirliği", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [2] }] },
          { label: "Çözünme Olayının Sınıflandırılması", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [3] }] },
          { label: "Çözeltilerde Derişim", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [4] }] },
          { label: "Çözünürlük", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [5] }] },
          { label: "Çözünürlüğe Etki Eden Faktörler", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [6] }] },
          { label: "Çözeltilerin Sınıflandırılması", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [7] }] },
          { label: "Koligatif Özellikler", group: "Çözeltiler", from: [{ course: "maarif10-kimya", unit: 2, topics: [8] }] },
        ],
      },
      {
        label: "6. Tema: Sürdürülebilirlik",
        buckets: [
          { label: "Makro ve Mikro Ölçekli Deneyler, Atmosferdeki Tepkimeler ve Küresel Sorunlar", group: "Yeşil Kimya, Çevresel ve Ekolojik Sürdürülebilirlik", from: [{ course: "maarif10-kimya", unit: 3, topics: [1] }] },
        ],
      },
    ],
    excluded: [
      // 9th grade, 1. Tema: "Kimya Hayattır › Kimya Alanında Kariyer Olanakları" (3)
      { course: "maarif9-kimya", unit: 1, topics: [3] },
      // 9th grade, 3. Tema: "... › Metal, Alaşım ve Metal Nanoparçacıkların Çevreye Etkisi" (3)
      { course: "maarif9-kimya", unit: 3, topics: [3] },
    ],
  },

  // Fizik: Ünite 1-4 are 9th grade's four units, Ünite 5-8 are 10th grade's four. Two levels only
  // (Ünite -> Bölüm leaf), no intermediate groups. Topics are picked by 1-based position in the raw
  // unit; every raw topic found a strictly matching bölüm, so nothing is excluded.
  //  - 9th "Basınç" is Katı Basıncı; "Termometreler" (under Isı/Öz Isı/Isı Sığası/Sıcaklık Farkı) is
  //    placed with Isı, Sıcaklık ve İç Enerji since it is about measuring sıcaklık.
  "maarif-tyt-fizik": {
    units: [
      {
        label: "1. Ünite: Fizik Bilimi ve Kariyer Keşfi",
        buckets: [
          { label: "Fizik Bilimi ve Fiziğin Alt Dalları", from: [{ course: "maarif9-fizik", unit: 1, topics: [1, 2] }] },
          { label: "Fiziğe Yön Verenler ve Fizik Bilimi ile İlgili Kariyer Keşfi", from: [{ course: "maarif9-fizik", unit: 1, topics: [3, 4] }] },
        ],
      },
      {
        label: "2. Ünite: Kuvvet ve Hareket - 1",
        buckets: [
          { label: "Fiziksel Niceliklerin Sınıflandırılması", from: [{ course: "maarif9-fizik", unit: 2, topics: [1, 2] }] },
          { label: "Vektörler", from: [{ course: "maarif9-fizik", unit: 2, topics: [3, 4, 5] }] },
          { label: "Doğadaki Temel Kuvvetler", from: [{ course: "maarif9-fizik", unit: 2, topics: [6] }] },
          { label: "Hareket ve Hareket Türleri", from: [{ course: "maarif9-fizik", unit: 2, topics: [7, 8] }] },
        ],
      },
      {
        label: "3. Ünite: Akışkanlar",
        buckets: [
          { label: "Katı Basıncı", from: [{ course: "maarif9-fizik", unit: 3, topics: [1] }] },
          { label: "Sıvı Basıncı", from: [{ course: "maarif9-fizik", unit: 3, topics: [2] }] },
          { label: "Açık Hava Basıncı", from: [{ course: "maarif9-fizik", unit: 3, topics: [3] }] },
          { label: "Kaldırma Kuvveti", from: [{ course: "maarif9-fizik", unit: 3, topics: [4] }] },
          { label: "Bernoulli İlkesi", from: [{ course: "maarif9-fizik", unit: 3, topics: [5] }] },
        ],
      },
      {
        label: "4. Ünite: Enerji - 1",
        buckets: [
          { label: "Isı, Sıcaklık ve İç Enerji", from: [{ course: "maarif9-fizik", unit: 4, topics: [1, 2] }] },
          { label: "Öz Isı ve Isı Sığası", from: [{ course: "maarif9-fizik", unit: 4, topics: [3] }] },
          { label: "Hâl Değişimi", from: [{ course: "maarif9-fizik", unit: 4, topics: [4] }] },
          { label: "Isı Alışverişi ve Isıl Denge", from: [{ course: "maarif9-fizik", unit: 4, topics: [5] }] },
          { label: "Isının Aktarım Yolları ve Isı İletim Hızı", from: [{ course: "maarif9-fizik", unit: 4, topics: [6, 7] }] },
        ],
      },
      {
        label: "5. Ünite: Kuvvet ve Hareket - 2",
        buckets: [
          { label: "Sabit Hızlı Hareket", from: [{ course: "maarif10-fizik", unit: 1, topics: [1] }] },
          { label: "Bir Boyutta Sabit İvmeli Hareket", from: [{ course: "maarif10-fizik", unit: 1, topics: [2] }] },
          { label: "Serbest Düşme", from: [{ course: "maarif10-fizik", unit: 1, topics: [3] }] },
          { label: "İki Boyutta Sabit İvmeli Hareket", from: [{ course: "maarif10-fizik", unit: 1, topics: [4] }] },
        ],
      },
      {
        label: "6. Ünite: Enerji - 2",
        buckets: [
          { label: "İş, Enerji ve Güç", from: [{ course: "maarif10-fizik", unit: 2, topics: [1] }] },
          { label: "Enerji Biçimleri", from: [{ course: "maarif10-fizik", unit: 2, topics: [2] }] },
          { label: "Mekanik Enerji", from: [{ course: "maarif10-fizik", unit: 2, topics: [3] }] },
          { label: "Enerji Kaynakları", from: [{ course: "maarif10-fizik", unit: 2, topics: [4] }] },
        ],
      },
      {
        label: "7. Ünite: Elektrik",
        buckets: [
          { label: "Basit Elektrik Devreleri ve Elektrik Akımı", from: [{ course: "maarif10-fizik", unit: 3, topics: [1, 2] }] },
          { label: "Ohm Yasası ve Dirençlerin Bağlanması", from: [{ course: "maarif10-fizik", unit: 3, topics: [3, 4] }] },
          { label: "Üreteçlerin Bağlanması", from: [{ course: "maarif10-fizik", unit: 3, topics: [5] }] },
          { label: "Elektrik Akımının Oluşturabileceği Tehlikelere Karşı Alınması Gereken Önlemler ve Topraklamanın Önemi", from: [{ course: "maarif10-fizik", unit: 3, topics: [6, 7] }] },
        ],
      },
      {
        label: "8. Ünite: Dalgalar",
        buckets: [
          { label: "Dalgaların Temel Kavramları", from: [{ course: "maarif10-fizik", unit: 4, topics: [1] }] },
          { label: "Dalgaların Sınıflandırılması ve Dalgaların Yayılma Süratini Etkileyen Etmenler", from: [{ course: "maarif10-fizik", unit: 4, topics: [2, 3] }] },
          { label: "Periyodik Hareketler", from: [{ course: "maarif10-fizik", unit: 4, topics: [4] }] },
          { label: "Su Dalgalarında Yansıma ve Kırılma", from: [{ course: "maarif10-fizik", unit: 4, topics: [5] }] },
          { label: "Rezonans ve Deprem", from: [{ course: "maarif10-fizik", unit: 4, topics: [6] }] },
        ],
      },
    ],
  },

  // Geometri has no course of its own in the 9th/10th data: its topics are units of the Matematik
  // courses (9th Tema 3 "Geometrik Şekiller" + Tema 4 "Eşlik ve Benzerlik", 10th Ünite 1 "Geometrik
  // Şekiller" + Ünite 6 "Analitik İnceleme"). This spec builds the separate Geometri course from them,
  // and the merged Matematik course no longer lists those units (see maarif-tyt.ts) -- each raw topic
  // is tracked in exactly one place. Two levels (Tema -> Bölüm leaf), no groups.
  // Approved compromises where the coach's list is finer than the raw topics (a bucket needs a raw
  // topic id of its own): "Doğruda ve Üçgende Açılar" + "Üçgende Açı Kenar Bağıntıları" are ONE bucket,
  // and so are "Üçgende Açıortay" + "Kenarortay" + "Kenar Orta Dikme ve Yükseklik". The raw topic
  // "Eşlik ve Benzerlikle İlgili Problemler" fits neither Eşlik nor Benzerlik alone, so it is excluded.
  "maarif-tyt-geometri": {
    onlyListedUnits: true,
    units: [
      {
        label: "1. Tema: Üçgenler (9. Sınıf)",
        buckets: [
          { label: "Doğruda ve Üçgende Açılar, Üçgende Açı Kenar Bağıntıları", from: [{ course: "maarif9-matematik", unit: 3, topics: [1] }] },
          { label: "Geometrik Dönüşümler", from: [{ course: "maarif9-matematik", unit: 4, topics: [1] }] },
          { label: "Üçgende Eşlik", from: [{ course: "maarif9-matematik", unit: 4, topics: [2] }] },
          { label: "Üçgenlerde Benzerlik", from: [{ course: "maarif9-matematik", unit: 4, topics: [3] }] },
          { label: "Dik Üçgen", from: [{ course: "maarif9-matematik", unit: 4, topics: [4] }] },
        ],
      },
      {
        label: "1. Tema: Üçgenler (10. Sınıf)",
        buckets: [
          { label: "Trigonometrik Oranlar ve Özdeşlikler", from: [{ course: "maarif10-matematik", unit: 1, topics: [1] }] },
          { label: "Üçgende Açıortay, Kenarortay, Kenar Orta Dikme ve Yükseklik", from: [{ course: "maarif10-matematik", unit: 1, topics: [2] }] },
          { label: "Üçgende Alan", from: [{ course: "maarif10-matematik", unit: 1, topics: [3] }] },
          { label: "Sinüs ve Kosinüs Teoremleri", from: [{ course: "maarif10-matematik", unit: 1, topics: [4] }] },
        ],
      },
      {
        label: "2. Tema: Analitik İnceleme",
        buckets: [
          { label: "Noktanın Analitik İncelenmesi", from: [{ course: "maarif10-matematik", unit: 6, topics: [1] }] },
          { label: "Doğrunun Analitik İncelenmesi", from: [{ course: "maarif10-matematik", unit: 6, topics: [2] }] },
        ],
      },
    ],
    excluded: [
      // 9th grade, 4. Tema: "Eşlik ve Benzerlikle İlgili Problemler" (5)
      { course: "maarif9-matematik", unit: 4, topics: [5] },
    ],
  },

  // Matematik: only the PURE MATH units of the 9th/10th Matematik courses -- the geometry units (9th Tema 3
  // + 4, 10th Ünite 1 + 6) belong to the separate Geometri spec above, so `onlyListedUnits` ignores them.
  // Two levels (Tema -> Bölüm leaf). The coach's list is finer than the raw topics in several places, and a
  // bucket needs a raw topic id of its own, so (same compromise as Komünite/Popülasyon and Geometri):
  //  - Üslü + Köklü Gösterimler = ONE raw topic -> one bucket;
  //  - Doğrusal Fonksiyonlarla ... Denklem + Eşitsizlik Problemleri = ONE raw topic -> one bucket;
  //  - Tema 5 Eşitsizlikler + Denklemler = ONE raw topic -> one bucket;
  //  - Tema 7 Sayma: the four listed bölümler are ONE raw topic ("Sayma Stratejileri") -> one bucket;
  //  - "Temel İşlem Yeteneği" has NO raw topic at all, so it cannot be tracked and is left out;
  //  - excluded: 9th "Olayların Olasılığına İlişkin Tümevarımsal Akıl Yürütme", not on the list.
  "maarif-tyt-matematik": {
    onlyListedUnits: true,
    units: [
      {
        label: "1. Tema: Sayılar",
        buckets: [
          { label: "Gerçek Sayıların Üslü ve Köklü Gösterimleri ile Yapılan İşlemler", from: [{ course: "maarif9-matematik", unit: 1, topics: [1] }] },
          { label: "Gerçek Sayı Aralıklarının Gösterimi ve Aralıklarla İlgili İşlemler", from: [{ course: "maarif9-matematik", unit: 1, topics: [2] }] },
          { label: "Sayı Kümelerinin Özellikleri ve Gerçek Sayıların İşlem Özellikleri", from: [{ course: "maarif9-matematik", unit: 1, topics: [3, 4] }] },
        ],
      },
      {
        label: "2. Tema: Nicelikler ve Değişimler",
        buckets: [
          { label: "Doğrusal Fonksiyonlar ve Nitel Özellikleri", from: [{ course: "maarif9-matematik", unit: 2, topics: [1] }] },
          { label: "Mutlak Değer Fonksiyonları ve Nitel Özellikleri", from: [{ course: "maarif9-matematik", unit: 2, topics: [2] }] },
          { label: "Doğrusal Fonksiyonlarla İfade Edilebilen Denklem ve Eşitsizlik Problemleri", from: [{ course: "maarif9-matematik", unit: 2, topics: [3] }] },
        ],
      },
      {
        label: "3. Tema: Sayılar",
        buckets: [
          { label: "Bir Doğal Sayı ile Asal Çarpanları ve Bölenleri Arasındaki İlişkiler", from: [{ course: "maarif10-matematik", unit: 3, topics: [1] }] },
          { label: "En Büyük Ortak Bölen (EBOB) ve En Küçük Ortak Kat (EKOK)", from: [{ course: "maarif10-matematik", unit: 3, topics: [2] }] },
          { label: "Bölünebilme Özelliklerini Kullanarak Kalan Bulma", from: [{ course: "maarif10-matematik", unit: 3, topics: [3] }] },
        ],
      },
      {
        label: "4. Tema: Algoritma ve Bilişim",
        buckets: [
          { label: "Algoritma Temelli Yaklaşımlarla Problem Çözme", from: [{ course: "maarif9-matematik", unit: 5, topics: [1] }] },
          { label: "Algoritmik Yapılar İçerisindeki Mantık Bağlaçları ve Niceleyiciler", from: [{ course: "maarif9-matematik", unit: 5, topics: [2] }] },
          { label: "Algoritmalarda ve Matematiksel İspatlarda Mantık Bağlaçları ve Niceleyiciler", from: [{ course: "maarif9-matematik", unit: 5, topics: [3] }] },
          { label: "Cebirsel İşlemlerin Algoritmik Yapısı", from: [{ course: "maarif10-matematik", unit: 5, topics: [2] }] },
        ],
      },
      {
        label: "5. Tema: Nicelikler ve Değişimler",
        buckets: [
          { label: "Gerçek Sayılarda Tanımlı Fonksiyonların Nitel Özellikleri", from: [{ course: "maarif10-matematik", unit: 4, topics: [1] }] },
          { label: "Gerçek Sayılarda Tanımlı Karesel Fonksiyonlar ve Nitel Özellikleri", from: [{ course: "maarif10-matematik", unit: 4, topics: [2] }] },
          { label: "Gerçek Sayılarda Tanımlı Karekök Fonksiyonlar ve Nitel Özellikleri", from: [{ course: "maarif10-matematik", unit: 4, topics: [3] }] },
          { label: "Gerçek Sayılarda Tanımlı Rasyonel Fonksiyonlar ve Nitel Özellikleri", from: [{ course: "maarif10-matematik", unit: 4, topics: [4] }] },
          { label: "Doğrusal, Karesel, Karekök ve Rasyonel Referans Fonksiyonlar ile Bu Fonksiyonlardan Türetilebilen Fonksiyonların Ters Fonksiyonları", from: [{ course: "maarif10-matematik", unit: 4, topics: [5] }] },
          { label: "Doğrusal, Karesel, Karekök ve Rasyonel Fonksiyonlardan Türetilebilen Eşitsizlikler ve Denklemler", from: [{ course: "maarif10-matematik", unit: 4, topics: [6] }] },
        ],
      },
      {
        label: "6. Tema: İstatistiksel Araştırma Süreci",
        buckets: [
          { label: "Tek Nicel Değişkenli Veri Dağılımları ile Çalışma ve Veriye Dayalı Karar Verme", from: [{ course: "maarif9-matematik", unit: 6, topics: [1, 2] }] },
          { label: "İki Kategorik Değişkenli Verilerle Çalışma, İlişkililik Analizi Yapma ve Yorumlama", from: [{ course: "maarif10-matematik", unit: 2, topics: [1, 2] }] },
        ],
      },
      {
        label: "7. Tema: Sayma",
        buckets: [
          { label: "Sayma Stratejileri, Sayma Çeşitleri, Faktöriyel, Sıralama Sayısı, Seçme Sayısı, Pascal (Paskal) Üçgeni, Güvercin Yuvası İlkesi", from: [{ course: "maarif10-matematik", unit: 5, topics: [1] }] },
        ],
      },
      {
        label: "8. Tema: Veriden Olasılığa",
        buckets: [
          { label: "Olayların Olasılığını Gözleme Dayalı Tahmin Etme", from: [{ course: "maarif9-matematik", unit: 7, topics: [1] }] },
          { label: "Koşullu Olasılık, Bayes Teoremi ve Uygulamaları", from: [{ course: "maarif10-matematik", unit: 7, topics: [1, 2] }] },
        ],
      },
    ],
    excluded: [
      // 9th grade, 7. Tema: "Olayların Olasılığına İlişkin Tümevarımsal Akıl Yürütme" (2)
      { course: "maarif9-matematik", unit: 7, topics: [2] },
    ],
  },

  // Türkçe (= the Türk Dili ve Edebiyatı courses): a FLAT list -- one unit with the empty label (FLAT_UNIT_LABEL),
  // so every table drops its Ünite column and shows only the bölüm rows. Only the grammar / paragraph topics
  // that strictly fit one of the coach's 14 buckets are placed; every literature topic (şiir, hikâye, roman,
  // tiyatro, destan, edebî sanatlar, ...) and every other non-matching raw topic is `excluded`.
  //  - "Cümle Anlamı" covers every sentence-level raw topic (here: "Cümle Türleri").
  //  - "Fiil, Ek-Fiil" takes Fiiller and Fiilimsiler (fiilimsiler are taught under fiil).
  //  - Six of the 14 listed buckets (Sözcük Anlamı, Anlatım Teknikleri, Paragrafın Yapısı, Paragrafta Yardımcı
  //    Düşünceler, Ekler, Sözcük Yapısı) have NO raw topic in the 9th/10th data, so they cannot be tracked and
  //    are left out.
  "maarif-tyt-turk-dili-ve-edebiyati": {
    units: [
      {
        label: "",
        buckets: [
          { label: "Cümle Anlamı", from: [{ course: "maarif10-turk-dili-ve-edebiyati", unit: 4, topics: [7] }] },
          { label: "Paragrafta Konu-Ana Düşünce", from: [{ course: "maarif9-turk-dili-ve-edebiyati", unit: 2, topics: [6, 7] }] },
          { label: "Sözcük Türleri", from: [{ course: "maarif10-turk-dili-ve-edebiyati", unit: 1, topics: [5] }, { course: "maarif10-turk-dili-ve-edebiyati", unit: 2, topics: [4, 5] }, { course: "maarif9-turk-dili-ve-edebiyati", unit: 4, topics: [4, 5] }] },
          { label: "Tamlamalar", from: [{ course: "maarif10-turk-dili-ve-edebiyati", unit: 1, topics: [6] }] },
          { label: "Fiil, Ek-Fiil", from: [{ course: "maarif10-turk-dili-ve-edebiyati", unit: 3, topics: [4, 5] }] },
          { label: "Ses Bilgisi", from: [{ course: "maarif9-turk-dili-ve-edebiyati", unit: 1, topics: [4] }] },
          { label: "Yazım Kuralları", from: [{ course: "maarif9-turk-dili-ve-edebiyati", unit: 1, topics: [5] }, { course: "maarif10-turk-dili-ve-edebiyati", unit: 4, topics: [8] }] },
          { label: "Noktalama İşaretleri", from: [{ course: "maarif9-turk-dili-ve-edebiyati", unit: 1, topics: [6] }, { course: "maarif10-turk-dili-ve-edebiyati", unit: 4, topics: [9] }] },
        ],
      },
    ],
    excluded: [
      // 9th Tema 1: Edebiyat ve Dil; Metin Türleri (Deneme, Mülakat)
      { course: "maarif9-turk-dili-ve-edebiyati", unit: 1, topics: [1, 2, 3] },
      // 9th Tema 2: hikâye, şiir (3), anı, Metni Anlama › Ana duygu
      { course: "maarif9-turk-dili-ve-edebiyati", unit: 2, topics: [1, 2, 3, 4, 5, 8] },
      // 9th Tema 3: hikâye, gezi yazısı, şiir inceleme (2)
      { course: "maarif9-turk-dili-ve-edebiyati", unit: 3, topics: [1, 2, 3, 4] },
      // 9th Tema 4: roman, eleştiri, tiyatro
      { course: "maarif9-turk-dili-ve-edebiyati", unit: 4, topics: [1, 2, 3] },
      // 10th Ünite 1: halk/İslamiyet öncesi şiiri, âşık tarzı, şiir bilgisi
      { course: "maarif10-turk-dili-ve-edebiyati", unit: 1, topics: [1, 2, 3, 4] },
      // 10th Ünite 2: divan şiiri, edebî sanatlar, saf şiir
      { course: "maarif10-turk-dili-ve-edebiyati", unit: 2, topics: [1, 2, 3] },
      // 10th Ünite 3: destanlar, halk hikâyeleri, mesneviler
      { course: "maarif10-turk-dili-ve-edebiyati", unit: 3, topics: [1, 2, 3] },
      // 10th Ünite 4: Dede Korkut, geçiş dönemi, Milli Edebiyat hikâyesi, roman/tiyatro/anı, haber metni, akımlar
      { course: "maarif10-turk-dili-ve-edebiyati", unit: 4, topics: [1, 2, 3, 4, 5, 6] },
    ],
  },
};

const SOURCE_COURSES: Course[] = [...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES];

const leafTitle = (name: string) => name.split(" › ").pop()!;
// Apostrophes and spacing differ between the coach's wording and the sheet's.
const norm = (s: string) => s.replace(/[’‘´`]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");

export type ResolvedBucket = { label: string; topics: Topic[]; group?: string };
export type ResolvedUnit = { label: string; buckets: ResolvedBucket[] };
export type ResolvedSpec = {
  units: ResolvedUnit[];
  // The raw topics the spec deliberately leaves out.
  excluded: Topic[];
  // Spec entries that matched nothing (a typo, or the data changed) --
  // surfaced for the tests, never thrown at runtime.
  unresolved: string[];
};

function resolveSource(source: Source, unresolved: string[]): Topic[] {
  const course = SOURCE_COURSES.find((c) => c.id === source.course);
  const unit = course?.units[source.unit - 1];
  if (!unit) {
    unresolved.push(`${source.course} unit ${source.unit}`);
    return [];
  }
  if (!source.topics) return unit.topics;
  const picked: Topic[] = [];
  for (const ref of source.topics) {
    const topic = typeof ref === "number" ? unit.topics[ref - 1] : unit.topics.find((t) => norm(leafTitle(t.name)) === norm(ref));
    if (topic) picked.push(topic);
    else unresolved.push(`${source.course} unit ${source.unit}: ${JSON.stringify(ref)}`);
  }
  return picked;
}

// Resolves a spec against the real 9th/10th topics. A topic is claimed by the
// FIRST bucket that names it, so nothing is ever counted twice.
export function resolveSpec(spec: SubjectSpec): ResolvedSpec {
  const unresolved: string[] = [];
  const claimed = new Set<string>();
  const units = spec.units.map((unit) => ({
    label: unit.label,
    buckets: unit.buckets.map((bucket) => {
      const topics = bucket.from.flatMap((source) => resolveSource(source, unresolved)).filter((t) => !claimed.has(t.id));
      topics.forEach((t) => claimed.add(t.id));
      return { label: bucket.label, topics, ...(bucket.group !== undefined ? { group: bucket.group } : {}) };
    }),
  }));
  const excluded = (spec.excluded ?? []).flatMap((source) => resolveSource(source, unresolved));
  return { units, excluded, unresolved };
}

// The source units ("course#unit", unit 1-based) a spec draws from or excludes.
// A course built from another course's units (Geometri, from Matematik) uses this
// to take them out of the course they came from.
export function specSourceUnits(spec: SubjectSpec): Set<string> {
  const keys = new Set<string>();
  for (const u of spec.units) for (const b of u.buckets) for (const f of b.from) keys.add(`${f.course}#${f.unit}`);
  for (const f of spec.excluded ?? []) keys.add(`${f.course}#${f.unit}`);
  return keys;
}

// True when a merged "Maarif TYT" course has a bucket structure (and so is
// laid out in buckets everywhere -- see alignedUnits).
export function hasBucketedStructure(courseId: string | null | undefined): boolean {
  return !!courseId && Object.prototype.hasOwnProperty.call(SUBJECT_SPECS, courseId);
}

// The merged course's units for a subject with a spec. Each bucket becomes its
// OWN unit entry under its spec unit's label (consecutive same-label entries
// still share one merged Ünite cell), marked as a leaf (Unit.bucket): the UI
// shows the bucket's name and nothing beneath it. The raw 9th/10th topics stay
// in `topics` -- real ids, real names -- only as the bucket's hidden members,
// so progress and mistakes can still be saved and read against them. A topic no
// bucket claims is never dropped: it becomes a leaf of its own (named by itself)
// at the end of the unit it came from, or under "Diğer" when no spec unit
// uses that source unit.
export function alignedUnits(spec: SubjectSpec): Unit[] {
  const resolved = resolveSpec(spec);
  const claimed = new Set([
    ...resolved.units.flatMap((u) => u.buckets.flatMap((b) => b.topics.map((t) => t.id))),
    ...resolved.excluded.map((t) => t.id),
  ]);
  const used = new Set(spec.units.flatMap((u) => u.buckets.flatMap((b) => b.from.map((s) => s.course))));

  const leftoversBySourceUnit = new Map<string, Topic[]>();
  const listedUnits = specSourceUnits(spec);
  for (const course of SOURCE_COURSES.filter((c) => used.has(c.id))) {
    course.units.forEach((unit, ui) => {
      if (spec.onlyListedUnits && !listedUnits.has(`${course.id}#${ui + 1}`)) return;
      const rest = unit.topics.filter((t) => !claimed.has(t.id));
      if (rest.length > 0) leftoversBySourceUnit.set(`${course.id}#${ui + 1}`, rest);
    });
  }

  const leftoverLeaf = (unit: string, topic: Topic): Unit => ({
    unit,
    bucket: leafTitle(topic.name),
    topics: [{ id: topic.id, name: topic.name }],
  });

  const taken = new Set<string>();
  const units: Unit[] = [];
  spec.units.forEach((unitSpec, ui) => {
    resolved.units[ui].buckets.forEach((bucket) => {
      if (bucket.topics.length === 0) return;
      units.push({
        unit: unitSpec.label,
        bucket: bucket.label,
        ...(bucket.group !== undefined ? { group: bucket.group } : {}),
        topics: bucket.topics.map((t) => ({ id: t.id, name: t.name })),
      });
    });
    const sourceKeys = new Set(unitSpec.buckets.flatMap((b) => b.from.map((s) => `${s.course}#${s.unit}`)));
    for (const key of sourceKeys) {
      if (taken.has(key)) continue;
      taken.add(key);
      for (const topic of leftoversBySourceUnit.get(key) ?? []) units.push(leftoverLeaf(unitSpec.label, topic));
    }
  });
  for (const [key, topics] of leftoversBySourceUnit) {
    if (taken.has(key)) continue;
    for (const topic of topics) units.push(leftoverLeaf("Diğer", topic));
  }
  return units;
}
