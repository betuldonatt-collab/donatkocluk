import type { TourStep } from "@/components/ui/platform-tour";

export type TourNavItem = {
  href: string;
  label: string;
  /** Shown for this item's step in the sidebar-overview walkthrough. */
  blurb: string;
  /**
   * Shown instead of the overview, as one or more spotlighted steps, when
   * the coach/student/admin/parent triggers the tour WHILE actually on
   * this page. Each still targets this same nav item (see navTarget
   * below) -- a deep dive never needs its own separate DOM anchor, it
   * just re-targets the always-present sidebar link for the page the
   * user is already looking at, with richer, page-specific text instead
   * of the one-line overview blurb.
   */
  deepDive?: { title: string; description: string }[];
};

function navTarget(href: string): string {
  return `[data-tour="${href}"]`;
}

function buildOverviewSteps(welcome: TourStep, items: TourNavItem[]): TourStep[] {
  return [welcome, ...items.map((item) => ({ title: item.label, description: item.blurb, target: navTarget(item.href) }))];
}

// Longest href first, so e.g. a hypothetical "/coach/students/123" page
// matches the more specific item before a shorter, unrelated prefix
// could.
function resolveDeepDive(items: TourNavItem[], pathname: string): TourStep[] | null {
  const match = [...items]
    .filter((item) => item.deepDive && pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match?.deepDive) return null;
  return match.deepDive.map((step) => ({ ...step, target: navTarget(match.href) }));
}

// Page-contextual resolution used by TourTrigger (components/ui/platform-
// tour.tsx): on the panel's own landing route, always show the full
// sidebar-overview walkthrough (one spotlighted step per nav item, in
// order) -- otherwise, use whichever item's deep dive matches the current
// page, falling back to the same overview walkthrough if nothing more
// specific has been authored for that exact page.
export function resolveTourSteps(config: { welcome: TourStep; items: TourNavItem[]; landingPath: string; pathname: string }): TourStep[] {
  if (config.pathname !== config.landingPath) {
    const deepDive = resolveDeepDive(config.items, config.pathname);
    if (deepDive) return deepDive;
  }
  return buildOverviewSteps(config.welcome, config.items);
}

// --- Coach -------------------------------------------------------------

export const COACH_WELCOME_STEP: TourStep = {
  title: "Hoş Geldin Koç!",
  description: "Donat Koçluk koç paneline hoş geldin. Sol taraftaki menüyü birlikte gezelim.",
};

export const COACH_LANDING_PATH = "/coach/dashboard";

export const COACH_NAV_ITEMS: TourNavItem[] = [
  { href: "/coach/dashboard", label: "Ana Sayfa", blurb: "Günlük özetini, bekleyen onaylarını ve uyarılarını burada görürsün." },
  { href: "/coach/notifications", label: "Bildirimler", blurb: "Öğrencilerinden gelen bildirimler burada birikir." },
  {
    href: "/coach/students",
    label: "Öğrencilerim",
    blurb: "Sana atanmış tüm öğrencilerin listesi burada.",
    deepDive: [
      {
        title: "Öğrenci Rosterin",
        description: '"Öğrencilerim" sayfasından sana atanmış her öğrencinin programını, kaynaklarını ve gelişimini tek yerden yönetebilirsin.',
      },
    ],
  },
  {
    href: "/coach/stopwatch",
    label: "Kronometre Yarışması",
    blurb: "Öğrencilerinin çalışma sürelerini ve sıralamasını buradan izlersin.",
    deepDive: [
      {
        title: "Kronometre Grupları",
        description: "Öğrencilerin için özel gruplar oluşturup adil bir sıralama sağlayabilirsin -- her öğrenci yalnızca kendi grubundakilerle yarışır.",
      },
      {
        title: "Aktif / Pasif Durum",
        description:
          "Kurallara uymayan bir öğrenciyi Pasif alarak yarışma sıralamasından çıkarabilirsin -- öğrenci yine de süresini kaydetmeye devam eder, sen de saatlerini görmeye devam edersin.",
      },
    ],
  },
  { href: "/coach/sessions", label: "Görüşmelerim", blurb: "Öğrencilerinle planladığın görüşmeleri buradan yönetirsin." },
  { href: "/coach/stats", label: "İstatistiklerim", blurb: "Koçluk performansına dair genel istatistiklerini buradan görürsün." },
  { href: "/coach/profile", label: "Profil", blurb: "Kendi profil bilgilerini buradan güncelleyebilirsin." },
  { href: "/coach/settings", label: "Ayarlar", blurb: "Görünüm ve hesap ayarlarını buradan yönetirsin." },
];

// --- Student -------------------------------------------------------------

export const STUDENT_WELCOME_STEP: TourStep = {
  title: "Hoş Geldin!",
  description: "Donat Koçluk öğrenci paneline hoş geldin. Sol taraftaki menüyü birlikte gezelim.",
};

export const STUDENT_LANDING_PATH = "/student";

export const STUDENT_NAV_ITEMS: TourNavItem[] = [
  {
    href: "/student",
    label: "Ana Sayfa",
    blurb: "Kronometreni çalıştırabilir, günlük/haftalık çalışma istatistiklerini görebilir ve görevlerini buradan tamamlayabilirsin.",
  },
  { href: "/student/paragraf-problem", label: "Paragraf/Problem Takibi", blurb: "Günlük paragraf ve problem sayılarını buradan kaydedersin." },
  { href: "/student/kaynak-takibi", label: "Kaynak Takibi", blurb: "Ders kaynaklarındaki ilerlemeni konu konu buradan işaretlersin." },
  { href: "/student/cikmis-sorular", label: "Çıkmış Sorular", blurb: "Yıllara göre çıkmış soru dağılımını buradan inceleyebilirsin." },
  { href: "/student/deneme-analizleri", label: "Deneme Analizleri", blurb: "Girdiğin denemelerin konu bazlı analizlerini burada görürsün." },
  { href: "/student/kaynak-kutuphanesi", label: "Kaynak Kütüphanesi", blurb: "Kullandığın tüm kaynakların listesi burada." },
  { href: "/student/profile", label: "Profilim", blurb: "Kendi profil bilgilerini buradan güncelleyebilirsin." },
  { href: "/student/settings", label: "Ayarlar", blurb: "Görünüm ve hesap ayarlarını buradan yönetirsin." },
];

// --- Admin -------------------------------------------------------------

export const ADMIN_WELCOME_STEP: TourStep = {
  title: "Hoş Geldin!",
  description: "Donat Koçluk yönetici paneline hoş geldin. Sol taraftaki menüyü birlikte gezelim.",
};

export const ADMIN_LANDING_PATH = "/admin";

export const ADMIN_NAV_ITEMS: TourNavItem[] = [
  { href: "/admin", label: "Ana Sayfa", blurb: "Bekleyen onaylar ve platform genelindeki uyarılar burada özetlenir." },
  {
    href: "/admin/students",
    label: "Öğrenci Rehberi",
    blurb: "Tüm öğrenci hesaplarını buradan yönetirsin.",
    deepDive: [
      {
        title: "Sistem Yönetimi",
        description: "Öğrenci Rehberi ve Koçlar sayfalarından hesapları, koç atamalarını ve kayıt isteklerini yönetebilirsin.",
      },
    ],
  },
  {
    href: "/admin/coaches",
    label: "Koçlar",
    blurb: "Koç hesaplarını ve öğrenci atamalarını buradan yönetirsin.",
    deepDive: [
      {
        title: "Koç Ataması",
        description: "Bir koça öğrenci atayabilir veya bir öğrencinin koçunu değiştirebilirsin -- her değişiklik platform genelinde anında yansır.",
      },
    ],
  },
  {
    href: "/admin/parent-connections",
    label: "Öğrenci Veli Eşleştirmeleri",
    blurb: "Veli hesaplarını öğrencileriyle buradan eşleştirirsin.",
  },
  { href: "/admin/profile", label: "Profil", blurb: "Kendi profil bilgilerini buradan güncelleyebilirsin." },
  { href: "/admin/settings", label: "Ayarlar", blurb: "Görünüm ve hesap ayarlarını buradan yönetirsin." },
];

// --- Parent -------------------------------------------------------------

export const PARENT_WELCOME_STEP: TourStep = {
  title: "Hoş Geldiniz!",
  description: "Donat Koçluk veli paneline hoş geldiniz. Sol taraftaki menüyü birlikte gezelim.",
};

export const PARENT_LANDING_PATH = "/parent";

export const PARENT_NAV_ITEMS: TourNavItem[] = [
  { href: "/parent", label: "Ana Sayfa", blurb: "Çocuğunuzun genel ilerlemesini burada görürsünüz." },
  {
    href: "/parent/karne",
    label: "Karneler",
    blurb: "Karne ve değerlendirmeleri buradan inceleyebilirsiniz.",
    deepDive: [
      {
        title: "İlerleme ve Karneler",
        description: "Ana sayfa ve Karneler bölümünden çocuğunuzun çalışma istatistiklerini ve koç değerlendirmelerini görebilirsiniz.",
      },
    ],
  },
  {
    href: "/parent/notes",
    label: "Koçtan Notlar",
    blurb: "Koçun paylaştığı notları buradan okuyabilirsiniz.",
    deepDive: [
      {
        title: "Güvenli, Salt Okunur Takip",
        description: "Bu panel yalnızca izleme amaçlıdır -- koçla iletişim mesajlaşma üzerinden değil, doğrudan görüşme yoluyla yürütülür.",
      },
    ],
  },
  { href: "/parent/settings", label: "Ayarlar", blurb: "Görünüm ve hesap ayarlarını buradan yönetirsin." },
];
