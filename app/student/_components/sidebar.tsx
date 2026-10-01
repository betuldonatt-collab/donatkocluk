"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Home,
  Languages,
  Library,
  School,
  Settings,
  Target,
  UserCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/ui/brand-logo";
import { TourTrigger } from "@/components/ui/platform-tour";
import { LogoutButton } from "@/components/logout-button";
import { YksCountdown } from "@/components/ui/yks-countdown";
import { STUDENT_LANDING_PATH, STUDENT_NAV_ITEMS, STUDENT_WELCOME_STEP } from "@/lib/tour-steps";
import { useIsMobileViewport } from "@/lib/use-is-mobile-viewport";
import { useMobileNavOpen } from "@/lib/use-mobile-nav-open";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Split around the Maarif Müfredatı group (below) so that group can render
// as its own small labeled section -- same two arrays feed both the real
// nav and, further down, the tour's step list.
const NAV_ITEMS_TOP: NavItem[] = [
  { href: "/student", label: "Ana Sayfa", icon: Home },
  { href: "/student/paragraf-problem", label: "Paragraf/Problem Takibi", icon: Target },
  { href: "/student/kaynak-takibi", label: "Kaynak Takibi", icon: BookOpenCheck },
  { href: "/student/cikmis-sorular", label: "Çıkmış Sorular", icon: CalendarClock },
  { href: "/student/deneme-analizleri", label: "Deneme Analizleri", icon: BarChart3 },
  { href: "/student/ingilizce-quiz", label: "İngilizce Quiz", icon: Languages },
];
const NAV_ITEMS_BOTTOM: NavItem[] = [
  { href: "/student/kaynak-kutuphanesi", label: "Kaynak Kütüphanesi", icon: Library },
  { href: "/student/profile", label: "Profilim", icon: UserCircle },
  { href: "/student/settings", label: "Ayarlar", icon: Settings },
];

// 9th, 10th and 11th grade all belong to the Türkiye Yüzyılı Maarif Modeli
// curriculum -- grouped under one small labeled section (not folded into
// the flat list above) so that shared origin reads at a glance. 9-10 share
// one page with a grade tab-switcher inside it (TYT); 11 has its own page
// (no 11th-grade content/cohort flag exists yet, see app/student/
// 11-sinif-maarif/page.tsx's own comment).
const MAARIF_GROUP_ITEMS: NavItem[] = [
  { href: "/student/9-10-sinif-tyt", label: "9-10. Sınıf (TYT)", icon: School },
  { href: "/student/11-sinif-maarif", label: "11. Sınıf", icon: GraduationCap },
];

// Only the YKS past-questions page stays hidden for 9th graders.
const MAARIF9_HIDDEN_HREFS = new Set(["/student/cikmis-sorular"]);
// İngilizce Quiz is LGS-only -- a YKS (or Maarif 9th/10th grade) student
// never sees it at all.
const LGS_ONLY_HREFS = new Set(["/student/ingilizce-quiz"]);
// The Maarif curriculum pages are YKS-only in the opposite direction -- an
// LGS (ortaokul) student has no 9th/10th/11th-grade content to browse.
const YKS_ONLY_HREFS = new Set(MAARIF_GROUP_ITEMS.map((item) => item.href));

// Shared by both the real nav and the tour's step list -- one spot for
// "which pages does this student's cohort actually see."
function filterNavItems<T extends { href: string; label: string }>(
  items: T[],
  { isMaarif9, examType }: { isMaarif9: boolean; examType: "YKS" | "LGS" },
): T[] {
  return items
    .filter(
      (item) =>
        !(isMaarif9 && MAARIF9_HIDDEN_HREFS.has(item.href)) &&
        !(examType !== "LGS" && LGS_ONLY_HREFS.has(item.href)) &&
        !(examType === "LGS" && YKS_ONLY_HREFS.has(item.href)),
    )
    .map((item) => (examType === "LGS" && item.href === "/student/paragraf-problem" ? { ...item, label: "Paragraf / Kitap Okuma" } : item));
}

export function StudentSidebar({
  fullName = null,
  examType = "YKS",
  isMaarif9 = false,
}: {
  fullName?: string | null;
  examType?: "YKS" | "LGS";
  // 9th grader: no YKS countdown, no TYT/AYT-specific tracking/analytics pages.
  isMaarif9?: boolean;
}) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNavOpen();
  const isMobile = useIsMobileViewport();
  const effectiveCollapsed = collapsed && !isMobile;
  // LGS students get every page a YKS student does, PLUS İngilizce Quiz
  // (LGS-only), MINUS the Maarif group (YKS-only); only the Paragraf/
  // Problem page is renamed (it is Paragraf / Kitap Okuma for them).
  const cohort = { isMaarif9, examType };
  const navItemsTop = filterNavItems(NAV_ITEMS_TOP, cohort);
  const navItemsBottom = filterNavItems(NAV_ITEMS_BOTTOM, cohort);
  const maarifGroupItems = filterNavItems(MAARIF_GROUP_ITEMS, cohort);

  // The guided tour walks the same flat STUDENT_NAV_ITEMS list (which
  // already includes the Maarif group's two entries, in sidebar order) --
  // same cohort filtering, same rename.
  const tourItems = filterNavItems(STUDENT_NAV_ITEMS, cohort).map((item) =>
    examType === "LGS" && item.href === "/student/paragraf-problem"
      ? { ...item, label: "Paragraf / Kitap Okuma", blurb: "Günlük paragraf ve kitap okuma çalışmalarını buradan takip edersin." }
      : item,
  );

  function renderLink({ href, label, icon: Icon }: NavItem) {
    const active = href === "/student" ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        data-tour={href}
        title={effectiveCollapsed ? label : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          effectiveCollapsed && "justify-center px-0",
          active
            ? "bg-primary-foreground/15 font-medium text-primary-foreground"
            : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!effectiveCollapsed && label}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        "bg-primary text-primary-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200 ease-in-out md:translate-x-0 md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        effectiveCollapsed ? "md:w-16" : "md:w-64",
      )}
    >
      <div className={cn("flex items-center gap-2 px-6 py-5", effectiveCollapsed && "justify-center px-0")}>
        <BrandLogo className="size-6" contrastBg />
        {!effectiveCollapsed && <span className="font-semibold">Donat Koçluk</span>}
      </div>
      {!effectiveCollapsed && !isMaarif9 && <YksCountdown variant="student" examType={examType} />}
      <nav className="flex flex-col gap-1 px-3">
        {navItemsTop.map(renderLink)}

        {maarifGroupItems.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {!effectiveCollapsed && (
              <p className="text-primary-foreground/50 px-3 text-[10px] font-semibold tracking-wide uppercase">Maarif Müfredatı</p>
            )}
            {maarifGroupItems.map(renderLink)}
          </div>
        )}

        {navItemsBottom.map(renderLink)}
      </nav>

      <div className="mt-auto px-3 pb-3">
        {!effectiveCollapsed && fullName && (
          <p className="text-primary-foreground/70 mb-2 truncate text-xs">Hoş geldin, {fullName}</p>
        )}
        <TourTrigger role="student" welcome={STUDENT_WELCOME_STEP} items={tourItems} landingPath={STUDENT_LANDING_PATH} collapsed={effectiveCollapsed} />
        <LogoutButton role="student" collapsed={effectiveCollapsed} />
      </div>

      {/* Floating rail toggle, half-hanging off the sidebar's own right
          edge -- not a footer row -- so it reads as a control on the
          sidebar's border rather than another nav item. Desktop-only:
          "collapsed" isn't a concept the mobile drawer has. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        className="bg-card text-foreground border-border hover:bg-accent absolute top-1/2 -right-3 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors md:flex"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  );
}
