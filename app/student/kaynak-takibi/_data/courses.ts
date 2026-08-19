// Resmi müfredat — kullanıcının verdiği unit/topics yapısı birebir
// kopyalandı. Hiçbir konu bölünmedi/birleştirilmedi/uydurulmadı.
//
// "Felsefe Grubu" kaynak veride 4 ayrı ders (Felsefe, Psikoloji, Sosyoloji,
// Mantık) olarak, her biri kendi ünite/konu listesiyle verildi — bu yüzden
// Sözel alanında 4 ayrı ders sekmesi olarak eklendi.
//
// AYT Coğrafya-2, kullanıcının verisinde "= aytCografya1" olarak (aynı
// içerik) tanımlandı; burada da aynı ünite/konu listesi kullanılıyor.
export type Topic = { id: string; name: string };
export type Unit = { unit: string; topics: Topic[] };
export type Course = {
  id: string;
  name: string;
  units: Unit[];
};

type RawUnit = { unit: string; topics: string[] };

function course(id: string, name: string, rawUnits: RawUnit[]): Course {
  return {
    id,
    name,
    units: rawUnits.map((u, ui) => ({
      unit: u.unit,
      topics: u.topics.map((topicName, ti) => ({ id: `${id}-u${ui}-t${ti}`, name: topicName })),
    })),
  };
}

// TYT+AYT Geometri — kaynak veride tek, ortak liste; hem TYT hem de
// Sayısal/Eşit Ağırlık AYT listesinde aynı ünite/konu yapısı kullanılıyor.
const GEOMETRI_UNITS: RawUnit[] = [
  {
    unit: "Üçgenler",
    topics: [
      "Üçgenlerde Temel Kavramlar",
      "Üçgenlerde Eşlik ve Benzerlik",
      "Üçgenin Yardımcı Elemanları",
      "Dik Üçgen ve Trigonometri",
      "Üçgenin Alanı/ Üçgenin Alanı ile İlgili Uygulamalar",
    ],
  },
  { unit: "Dörtgenler ve Çokgenler", topics: ["Çokgenler/ Dörtgenler ve Özellikleri", "Özel Dörtgenler"] },
  { unit: "Uzay Geometri", topics: ["Katı Cisimler"] },
  { unit: "-", topics: ["Çember ve Daire"] },
  { unit: "Analitik Geometri", topics: ["Doğrunun Analitik İncelenmesi", "Çemberin Analitik İncelenmesi"] },
  { unit: "-", topics: ["Dönüşümler"] },
];
const geometriCourse = (id: string) => course(id, "Geometri", GEOMETRI_UNITS);

export const TYT_COURSES: Course[] = [
  course("tyt-turkce", "Türkçe", [
    { unit: "Anlam Bilgisi", topics: ["Sözcükte Anlam", "Cümlede Anlam", "Paragrafta Anlam"] },
    {
      unit: "-",
      topics: [
        "Paragrafın Yapısı",
        "Sözcükte Yapı/ Biçim Bilgisi",
        "Ses Bilgisi",
        "Yazım Kuralları",
        "Noktalama İşaretleri",
      ],
    },
    {
      unit: "İsim Soylu Sözcükler",
      topics: ["İsimler", "Sıfatlar", "Zamirler", "Zarflar", "Edatlar, Ünlemler ve Bağlaçlar"],
    },
    { unit: "Fiiller", topics: ["Fiillerde Kip ve Kişi", "Fiilde Yapı", "Ek Fiil", "Fiilimsi", "Fiilde Çatı"] },
    { unit: "-", topics: ["Cümlenin Ögeleri", "Cümle Türleri", "Anlatım Bozuklukları"] },
  ]),
  course("tyt-matematik", "Matematik", [
    {
      unit: "-",
      topics: [
        "Temel Kavramlar",
        "Sayı Basamakları",
        "Bölme Bölünebilme Kuralları",
        "EBOB-EKOK",
        "Rasyonel Sayılar",
        "Basit Eşitsizlikler",
        "Mutlak Değer",
        "Üslü Sayılar",
        "Köklü Sayılar",
        "Çarpanlara Ayırma",
        "Oran Orantı",
        "Birinci Dereceden Denklemler",
      ],
    },
    {
      unit: "Problemler",
      topics: [
        "Sayı Kesir Problemleri",
        "Yaş Problemleri",
        "İşçi Problemleri",
        "Hız Problemleri",
        "Karışım Problemleri",
        "Yüzde Kâr-Zarar Problemleri",
        "Grafik Problemleri",
        "Rutin Olmayan Problemler",
      ],
    },
    {
      unit: "-",
      topics: [
        "Kümeler Kartezyen Çarpım",
        "Mantık",
        "Fonksiyonlar",
        "Polinomlar",
        "Permütasyon Kombinasyon",
        "Olasılık",
        "Veri İstatistik",
      ],
    },
  ]),
  geometriCourse("tyt-geometri"),
  course("tyt-fizik", "Fizik", [
    {
      unit: "-",
      topics: [
        "Fizik Bilimine Giriş",
        "Madde ve Özellikleri",
        "Hareket ve Kuvvet",
        "İş, Güç, Enerji",
        "Isı, Sıcaklık ve Genleşme",
        "Elektrostatik",
        "Elektrik Akımı ve Devreler",
        "Mıknatıslar ve Manyetizma",
        "Basınç",
        "Kaldırma Kuvveti",
      ],
    },
    { unit: "Dalgalar", topics: ["Dalgalara Giriş", "Yay Dalgaları", "Su Dalgaları", "Ses Dalgaları", "Deprem Dalgaları"] },
    {
      unit: "Optik",
      topics: [
        "Aydınlanma",
        "Gölge Yansıma",
        "Düzlem Aynalar",
        "Küresel Aynalar",
        "Işığın Kırılması ve Renkler",
        "Mercekler ve Optik Araçlar/ Prizmalar",
      ],
    },
  ]),
  course("tyt-kimya", "Kimya", [
    {
      unit: "-",
      topics: [
        "Kimya Bilimi",
        "Atom ve Periyodik Sistem",
        "Kimyasal Türler Arası Etkileşimler",
        "Maddenin Halleri",
        "Kimyanın Temel Kanunları Kimyasal Hesaplamalar",
        "Karışımlar",
        "Asitler, Bazlar ve Tuzlar",
        "Kimya Her Yerde",
      ],
    },
  ]),
  course("tyt-biyoloji", "Biyoloji", [
    {
      unit: "Temel Bileşenler/ Yaşam Bilimi Biyoloji",
      topics: [
        "Canlıların Ortak Özellikleri",
        "Su, Tuz ve Mineraller",
        "Karbonhidratlar",
        "Lipitler",
        "Proteinler",
        "Enzimler",
        "Vitaminler",
        "Nükleik Asitler",
        "ATP",
      ],
    },
    {
      unit: "Hücre",
      topics: ["Hücre, Çekirdek ve Sitoplazma", "Organeller", "Hücre İskeleti", "Hücre Zarı ve Hücre Duvarı", "Hücre Zarından Madde Geçişleri"],
    },
    {
      unit: "Canlılar Dünyası",
      topics: [
        "Canlılığın Çeşitliliği ve Sınıflandırılması",
        "Bakteriler",
        "Arkeler",
        "Protistalar",
        "Bitkiler",
        "Mantarlar",
        "Hayvanlar",
        "Virüsler",
      ],
    },
    { unit: "Hücre Bölünmeleri", topics: ["Mitoz", "Eşeysiz Üreme", "Mayoz", "Eşeyli Üreme"] },
    { unit: "-", topics: ["Kalıtım"] },
    { unit: "Ekosistem Ekolojisi", topics: ["Ekolojik Kavramlar", "Madde Döngüleri", "Güncel Çevre Sorunları"] },
  ]),
  course("tyt-tarih", "Tarih", [
    {
      unit: "-",
      topics: [
        "İlk ve Orta Çağlarda Türk Dünyası",
        "Türklerin İslamiyeti Kabulü ve İlk Türk İslam Devletleri",
        "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi",
        "Beylikten Devlete Osmanlı Siyaseti (1302-1453)",
        "Sultan ve Osmanlı Merkez Teşkilatı",
        "Değişen Dünya Dengeleri Karşısında Osmanlı Siyaseti (1595-1774)",
        "Uluslararası İlişkilerde Denge Stratejisi (1774-1914)",
        "XIX VE XX. Yüzyılda Değişen Sosyoekonomik Hayat",
        "Milli Mücadele",
        "Atatürkçülük ve Türk İnkılabı",
      ],
    },
  ]),
  course("tyt-cografya", "Coğrafya", [
    {
      unit: "Doğal Sistemler",
      topics: [
        "Doğa ve İnsan Etkileşimi",
        "Coğrafya Bilimi ve Bölümlenmesi",
        "Dünya'nın Şekli ve Hareketleri",
        "Coğrafi Koordinat Sistemi",
        "Harita Okuryazarlığı",
        "Atmosfer ve İklim Bilgisi",
        "Dünya'nın Yapısı ve Oluşum Süreci",
        "Su Kaynakları",
        "Topraklar",
        "Bitkiler",
      ],
    },
    { unit: "Beşeri Sistemler", topics: ["Yerleşmeler", "Nüfus ve Güç", "Ekonomik Faaliyetler"] },
    { unit: "Küresel Ortam: Bölgeler ve Ülkeler", topics: ["Bölgeler", "Uluslararası Ulaşım Hatları"] },
    { unit: "Çevre ve Toplum", topics: ["Afetler"] },
  ]),
  course("tyt-felsefe", "Felsefe", [
    {
      unit: "-",
      topics: [
        "Felsefenin Alanı",
        "Bilgi Felsefesi",
        "Bilim Felsefesi",
        "Varlık Felsefesi",
        "Ahlak Felsefesi",
        "Siyaset Felsefesi",
        "Din Felsefesi",
        "Sanat Felsefesi",
      ],
    },
  ]),
  course("tyt-din", "Din Kültürü ve Ahlak Bilgisi", [
    {
      unit: "-",
      topics: [
        "Bilgi ve İnanç",
        "İbadetler",
        "Ahlak ve Değerler",
        "Hz. Muhammed (S.A.V)",
        "Vahiy ve Akıl",
        "İslam Düşüncesinde Yorumlar, Mezhepler",
        "Din, Kültür ve Medeniyet",
      ],
    },
  ]),
];

const aytMatematik = course("ayt-matematik", "Matematik", [
  {
    unit: "-",
    topics: [
      "Denklem ve Eşitsizlikler",
      "Mantık",
      "Kümeler",
      "Fonksiyonlar",
      "Polinomlar",
      "2. Dereceden Denklemler/ Denklem ve Eşitsizlik Sistemleri",
    ],
  },
  { unit: "Sayma ve Olasılık", topics: ["Permütasyon Kombinasyon", "Binom", "Olasılık"] },
  {
    unit: "Trigonometri",
    topics: [
      "Yönlü Açılar, Trigonometrik Fonksiyonlar",
      "Cos-Sin Teoremleri, Ters Trigonometrik Fonksiyonlar",
      "Toplam-Fark ve İki Kat Açı Formülleri",
      "Trigonometrik Denklemler",
    ],
  },
  { unit: "-", topics: ["Logaritma", "Diziler", "Limit ve Süreklilik", "Türev", "İntegral"] },
]);

const aytFizik = course("ayt-fizik", "Fizik", [
  {
    unit: "Kuvvet ve Hareket",
    topics: [
      "Vektörler",
      "Bağıl Hareket",
      "Newton'un Hareket Yasaları",
      "Bir Boyutta Sabit İvmeli Hareket",
      "İki Boyutta Hareket",
      "Enerji ve Hareket",
      "İtme ve Çizgisel Momentum",
      "Tork",
      "Denge",
      "Basit Makineler",
    ],
  },
  { unit: "Elektrik ve Manyetizma", topics: ["Elektrik", "Manyetizma", "Alternatif Akım", "Transformatörler"] },
  {
    unit: "Çembersel Hareket",
    topics: ["Düzgün Çembersel Hareket", "Dönerek Öteleme Hareketi", "Açısal Momentum", "Kütle Çekim Kuvveti - Kepler Kanunları"],
  },
  {
    unit: "-",
    topics: [
      "Basit Harmonik Hareket",
      "Dalga Mekaniği",
      "Atom Fiziğine Giriş ve Radyoaktivite",
      "Modern Fizik",
      "Modern Fiziğin Teknolojideki Uygulamaları",
    ],
  },
]);

const aytKimya = course("ayt-kimya", "Kimya", [
  { unit: "Modern Atom Teorisi", topics: ["Atomun Kuantum Modeli", "Periyodik Özellikler", "Yükseltgenme Basamakları"] },
  { unit: "-", topics: ["Gazlar"] },
  { unit: "Sıvı Çözeltiler ve Çözünürlük", topics: ["Derişim Birimleri", "Koligatif Özellikler", "Çözünürlük"] },
  {
    unit: "Kimyasal Tepkimelerde Enerji",
    topics: ["Tepkimelerde Isı Değişimi", "Oluşum Entalpisi", "Tepkime Isılarının Toplanabilirliği"],
  },
  { unit: "Denge", topics: ["Kimyasal Denge", "Dengeyi Etkileyen Faktörler", "Sulu Çözelti Dengeleri"] },
  {
    unit: "Kimya ve Elektrik",
    topics: [
      "İndirgenme Yükseltgenme Tepkimelerinde Elektrik Akımı",
      "Elektrotlar ve Elektrokimyasal Hücreler",
      "Elektrot Potansiyelleri",
      "Elektroliz",
      "Korozyon",
    ],
  },
  {
    unit: "Organik Kimya",
    topics: [
      "Karbon Kimyasına Giriş",
      "Hidrokarbonlar",
      "Fonksiyonel Gruplar",
      "Alkoller Eterler",
      "Karbonil Bileşikleri",
      "Karboksilik Asitler",
      "Esterler",
    ],
  },
]);

const aytBiyoloji = course("ayt-biyoloji", "Biyoloji", [
  {
    unit: "İnsan Fizyolojisi",
    topics: [
      "Sinir Sistemi",
      "Endokrin Sistem",
      "Duyu Organları",
      "Destek ve Hareket Sistemi",
      "Sindirim Sistemi",
      "Dolaşım ve Bağışıklık Sistemi",
      "Solunum Sistemi",
      "Üriner Sistem",
      "Üreme Sistemi ve Embriyonik Gelişim",
    ],
  },
  { unit: "-", topics: ["Komünite ve Popülasyon Ekolojisi"] },
  { unit: "Genden Proteine", topics: ["Nükleik Asitlerin Keşfi ve Önemi", "Genetik Şifre ve Protein Sentezi"] },
  { unit: "Canlılarda Enerji Dönüşümleri", topics: ["Canlılık ve Enerji", "Fotosentez", "Kemosentez", "Hücresel Solunum"] },
  { unit: "Bitki Biyolojisi", topics: ["Bitkilerin Yapısı", "Bitkilerde Madde Taşınması", "Bitkilerde Eşeyli Üreme"] },
  { unit: "-", topics: ["Canlılar ve Çevre"] },
]);

const aytEdebiyat = course("ayt-edebiyat", "Edebiyat", [
  {
    unit: "-",
    topics: [
      "Sözcükte Anlam",
      "Cümlede Anlam",
      "Paragrafta Anlam",
      "Şiir Bilgisi",
      "Söz Sanatları",
      "Nesir Bilgisi",
      "İslamiyet Öncesi Türk Edebiyatı / Geçiş Dönemi Türk Edebiyatı",
    ],
  },
  { unit: "Halk Edebiyatı", topics: ["Anonim Halk Edebiyatı", "Aşık Tarzı Halk Edebiyatı", "Tekke Edebiyatı"] },
  {
    unit: "Divan Edebiyatı",
    topics: [
      "Divan Edebiyatı Nazım Şekilleri (Biçimleri)",
      "Divan Edebiyatı Nazım Türleri (Konularına Göre)",
      "Divan Edebiyatı Akımları",
      "Divan Edebiyatı Sanatçıları",
    ],
  },
  { unit: "-", topics: ["Tanzimat Dönemi Türk Edebiyatı", "Servetifünun Dönemi Türk Edebiyatı", "Fecriati Dönemi Türk Edebiyatı"] },
  {
    unit: "Milli Edebiyat",
    topics: [
      "Milli Edebiyat Şiiri",
      "Milli Edebiyat Roman ve Hikayesi",
      "Beş Hececiler",
      "Dönem Sanatçıları",
      "Bağımsız Sanatçılar",
      "Öğretici Metinler",
    ],
  },
  {
    unit: "Cumhuriyet Şiiri",
    topics: [
      "Saf (Öz) Şiir",
      "Yedi Meşaleciler",
      "Toplumcu Eğilimi Yansıtan Şiir",
      "Milli Edebiyat Zevk ve Anlayışını Sürdüren Şiir",
      "Garip Hareketi",
      "İkinci Yeni Şiiri",
      "Dini Değerleri-Geleneksel Duyarlığı ve Metafizik Anlayışı Öne Çıkaran Modern Şiir",
      "1960 Sonrası Toplumcu Eğilimleri Yansıtan Şiir",
      "1960 Sonrası Türk Şiiri",
      "Cumhuriyet Sonrası Halk Şiiri",
    ],
  },
  {
    unit: "Cumhuriyet Hikayesi",
    topics: [
      "Bireyin İç Dünyasını Esas Alan Hikaye",
      "Toplumcu Gerçekçi Hikaye",
      "Milli - Dini Duyarlılığı Yansıtan Hikaye",
      "Modernist Hikaye",
    ],
  },
  {
    unit: "Cumhuriyet Romanı",
    topics: [
      "Milli - Dini Duyarlılığı Yansıtan Roman",
      "Bireyin İç Dünyasını Esas Alan Roman",
      "Toplumcu Gerçekçi Roman",
      "Modernist Roman",
    ],
  },
  { unit: "Cumhuriyet Edebiyatı", topics: ["Cumhuriyet Dönemi Türk Tiyatrosu", "Cumhuriyet Dönemi Öğretici Metinler"] },
  { unit: "-", topics: ["Geleneksel Türk Tiyatrosu", "Masal / Fabl / Destan / Halk Hikayesi", "Edebi Akımlar"] },
]);

const aytTarih1 = course("ayt-tarih1", "Tarih-1", [
  { unit: "-", topics: ["Tarih ve Zaman"] },
  { unit: "İnsanlığın İlk Dönemleri", topics: ["İlk Çağda Başlıca Medeniyet Havzaları", "Kanunlar Doğuyor"] },
  { unit: "İlk ve Orta Çağlarda Türk Dünyası", topics: ["Coğrafya ile Oluşan Yaşam Tarzı", "Boylardan Devlete"] },
  { unit: "İslam Medeniyetinin Doğuşu", topics: ["İslamiyet Yayılıyor", "Abbasi Devleti ve Türkler"] },
  {
    unit: "Türklerin İslamiyeti Kabulü ve İlk Türk İslam Devletleri",
    topics: [
      "İslamiyetin Türk Devlet ve Toplum Yapısına Etkisi",
      "Büyük Selçuklu Türkiyesi",
      "Büyük Selçuklu Devletinde Yönetim ve Toplum Yapısı",
    ],
  },
  {
    unit: "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi",
    topics: ["Anadolu'nun İlk Türk Siyasi Teşekkülleri", "Hilal ve Haç Mücadelesi"],
  },
  {
    unit: "Beylikten Devlete Osmanlı Siyaseti",
    topics: ["Devletleşme Sürecinde Osmanlı - Bizans İlişkileri", "Osmanlı Devleti'nin Rumelideki İskan ve İstimalet Politikası"],
  },
  {
    unit: "-",
    topics: [
      "Devletleşme Sürecinde Savaşçılar ve Askerler",
      "Dünya Gücü Osmanlı",
      "Sultan ve Osmanlı Merkez Teşkilatı",
      "Değişim Çağında Avrupa ve Osmanlı",
      "Devrimler Çağında Değişen Devlet - Toplum İlişkileri",
    ],
  },
  {
    unit: "Uluslararası İlişkilerde Denge Stratejisi",
    topics: ["Osmanlı Devletine Yönelik Tehditler", "Osmanlı Devletinde Demokratikleşme Hareketleri"],
  },
  { unit: "-", topics: ["XIX. ve XX. Yüzyılda Değişen Sosyoekonomik Hayat"] },
  {
    unit: "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya",
    topics: [
      "Mustafa Kemal'in Lider Olarak Yetişmesinde Etkili Koşullar",
      "I. Dünya Savaşı Sürecinde Osmanlı Devleti",
      "I. Dünya Savaşı'nın Sonuçları",
    ],
  },
  {
    unit: "Milli Mücadele",
    topics: [
      "Milli Mücadeleye Hazırlık Dönemi",
      "Doğu ve Güney Cepheleri ile Bu Cephelerde Öne Çıkan Şahsiyetler",
      "Batı Cephesi ve Bu Cephede Öne Çıkan Şahsiyetler",
      "Milli Mücadelenin Sona Ermesi ve Lozan Barış Antlaşması",
    ],
  },
  {
    unit: "Atatürkçülük ve Türk İnkılabı",
    topics: ["Atatürk İlkeleri", "Siyasi Alandaki Gelişmeler", "Toplumsal Alandaki İnkılaplar"],
  },
  { unit: "İki Savaş Arası Dönemde Türkiye ve Dünya", topics: ["Atatürk Dönemi Dış Politikası"] },
  { unit: "-", topics: ["II. Dünya Savaşı Sürecinde Türkiye ve Dünya"] },
]);

const aytCografya1Units: RawUnit[] = [
  {
    unit: "Doğal Sistemler",
    topics: ["Ekosistemlerin Özellikleri ve İşleyişi", "Ekstrem Doğa Olayları", "Küresel İklim Değişikliği ve Doğa Olaylarının Geleceği"],
  },
  {
    unit: "Beşeri Sistemler",
    topics: [
      "Nüfus Politikaları ve Projeksiyonları",
      "Şehirler ve Kırsal Yerleşmeler",
      "Dünyada Doğal Kaynak ve Ekonomi",
      "Türkiye' de Tarım, Sanayi, Maden ve Enerji Kaynakları",
      "Ekonomi, Şehirleşme ve Göç",
      "İşlevsel Bölge ve Kalkınma Projeleri",
      "Hizmet Sektörü ve Ulaşım",
      "Türkiye' de ve Dünyada Ticaret",
      "Türkiye' de Turizm",
    ],
  },
  {
    unit: "Küresel Ortam: Bölgeler ve Ülkeler",
    topics: ["Kültür Bölgeleri ve Türk Kültürü", "Küreselleşen Dünya", "Uluslararası Örgütler", "Jeopolitik Konum ve Ülkeler Arası Etkileşim"],
  },
  { unit: "Çevre ve Toplum", topics: ["Çevre Sorunları ve Geri Dönüşüm", "Çevre Sorunlarının Çözümüne Yönelik Yaklaşımlar"] },
];
const aytCografya1 = course("ayt-cografya1", "Coğrafya-1", aytCografya1Units);

const aytTarih2 = course("ayt-tarih2", "Tarih-2", [
  {
    unit: "-",
    topics: [
      "Tarih ve Zaman",
      "İnsanlığın İlk Dönemleri",
      "İlk ve Orta Çağlarda Türk Dünyası",
      "Türklerin İslamiyeti Kabulü ve İlk Türk İslam Devletleri",
      "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi",
      "Beylikten Devlete Osmanlı Siyaseti",
      "Devletleşme Sürecinde Savaşçılar ve Askerler",
      "Beylikten Devlete Osmanlı Medeniyeti",
      "Dünya Gücü Osmanlı",
      "Sultan ve Osmanlı Merkez Teşkilatı",
      "Klasik Çağda Osmanlı Toplum Düzeni",
      "Değişen Dünya Dengeleri Karşısında Osmanlı Siyaseti",
      "Değişim Çağında Avrupa ve Osmanlı",
      "Devrimler Çağında Değişen Devlet - Toplum İlişkileri",
      "Uluslararası İlişkilerde Denge Stratejisi",
      "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya",
      "Milli Mücadele",
      "Atatürkçülük ve Türk İnkılabı",
      "II. Dünya Savaşı Sürecinde Türkiye ve Dünya",
      "II. Dünya Savaşı Sonrasında Türkiye ve Dünya",
      "Toplumsal Devrim Çağında Dünya ve Türkiye",
      "21. Yüzyılın Eşiğinde Türkiye ve Dünya",
    ],
  },
]);

// Kullanıcının verisinde "aytCografya2 = aytCografya1" olarak (aynı içerik)
// tanımlandı — burada da aynı ünite/konu listesi, ayrı ders id'siyle kullanıldı.
const aytCografya2 = course("ayt-cografya2", "Coğrafya-2", aytCografya1Units);

const aytFelsefe = course("ayt-felsefe", "Felsefe", [
  { unit: "-", topics: ["Felsefeyi Tanıma", "Felsefe ile Düşünme"] },
  {
    unit: "Felsefenin Temel Konuları ve Problemleri",
    topics: ["Varlık Felsefesi", "Bilgi Felsefesi", "Bilim Felsefesi", "Ahlak Felsefesi", "Din Felsefesi", "Siyaset Felsefesi", "Sanat Felsefesi"],
  },
  { unit: "-", topics: ["Felsefi Okuma ve Yazma"] },
]);

const aytPsikoloji = course("ayt-psikoloji", "Psikoloji", [
  {
    unit: "-",
    topics: ["Psikoloji Bilimini Tanıyalım", "Psikolojinin Temel Süreçleri", "Öğrenme, Bellek, Düşünme", "Ruh Sağlığının Temelleri"],
  },
]);

const aytSosyoloji = course("ayt-sosyoloji", "Sosyoloji", [
  {
    unit: "-",
    topics: ["Sosyolojiye Giriş", "Birey ve Toplum", "Toplumsal Yapı", "Toplumsal Değişme ve Gelişme", "Toplum ve Kültür", "Toplumsal Kurumlar"],
  },
]);

const aytMantik = course("ayt-mantik", "Mantık", [
  { unit: "-", topics: ["Mantığa Giriş", "Klasik Mantık", "Mantık ve Dil", "Sembolik Mantık"] },
]);

const aytDin = course("ayt-din", "Din", [
  {
    unit: "-",
    topics: [
      "Allah-İnsan İlişkisi",
      "Dünya ve Ahiret",
      "Kur'an'a Göre Hz. Muhammed",
      "Kur'an'da Bazı Kavramlar",
      "Kur'an'dan Mesajlar",
      "İnançla İlgili Meseleler",
      "Yahudilik ve Hristiyanlık",
      "İslam ve Bilim",
      "Anadolu'da İslam",
      "İslam Düşüncesinde Tasavvufi Yorumlar ve Mezhepler",
      "Güncel Dini Meseleler",
      "Hint ve Çin Dinleri",
    ],
  },
]);

export type Track = "sayisal" | "ea" | "sozel";

export const TRACK_LABELS: Record<Track, string> = {
  sayisal: "Sayısal",
  ea: "Eşit Ağırlık",
  sozel: "Sözel",
};

export const AYT_COURSES_BY_TRACK: Record<Track, Course[]> = {
  sayisal: [aytMatematik, geometriCourse("ayt-say-geometri"), aytFizik, aytKimya, aytBiyoloji],
  ea: [aytMatematik, geometriCourse("ayt-ea-geometri"), aytEdebiyat, aytTarih1, aytCografya1],
  sozel: [
    aytEdebiyat,
    aytTarih1,
    aytCografya1,
    aytTarih2,
    aytCografya2,
    aytFelsefe,
    aytPsikoloji,
    aytSosyoloji,
    aytMantik,
    aytDin,
  ],
};
