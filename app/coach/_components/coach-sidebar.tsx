"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, Calendar, ChevronLeft, ChevronRight, Home, Settings, Timer, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { TourTrigger } from "@/components/ui/platform-tour";
import { COACH_LANDING_PATH, COACH_NAV_ITEMS, COACH_WELCOME_STEP } from "@/lib/tour-steps";
import { useIsMobileViewport } from "@/lib/use-is-mobile-viewport";
import { useMobileNavOpen } from "@/lib/use-mobile-nav-open";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Ana Sayfa", icon: Home },
  { href: "/coach/notifications", label: "Bildirimler", icon: Bell },
  { href: "/coach/students", label: "Öğrencilerim", icon: Users },
  { href: "/coach/stopwatch", label: "Kronometre Yarışması", icon: Timer },
  { href: "/coach/sessions", label: "Görüşmelerim", icon: Calendar },
  { href: "/coach/stats", label: "İstatistiklerim", icon: BarChart3 },
  { href: "/coach/profile", label: "Profil", icon: User },
  { href: "/coach/settings", label: "Ayarlar", icon: Settings },
];

export function CoachSidebar({ unreadCount = 0, fullName = null }: { unreadCount?: number; fullName?: string | null }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNavOpen();
  const isMobile = useIsMobileViewport();
  // The desktop icon-rail preference is meaningless once this is an
  // off-canvas drawer (a narrow "collapsed" drawer makes no sense) --
  // below md this always renders fully expanded regardless of what's
  // saved in useSidebarCollapsed, so a coach who collapsed their rail on
  // desktop doesn't open a phone to a wide drawer full of unlabeled icons.
  const effectiveCollapsed = collapsed && !isMobile;

  return (
    <aside
      className={cn(
        "bg-primary text-primary-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200 ease-in-out md:translate-x-0 md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        effectiveCollapsed ? "md:w-16" : "md:w-64",
      )}
    >
      <div className={cn("flex items-center gap-2 px-6 py-5", effectiveCollapsed && "justify-center px-0")}>
        <Logo className="size-6" contrastBg />
        {!effectiveCollapsed && <span className="font-semibold">Donat Koçluk</span>}
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const isNotifications = href === "/coach/notifications";
          return (
            <Link
              key={href}
              href={href}
              // Consumed by the tour's spotlight engine (see
              // lib/tour-steps.ts's navTarget) -- every nav item is a
              // stable, always-present anchor a tour step can highlight.
              data-tour={href}
              title={effectiveCollapsed ? label : undefined}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                effectiveCollapsed && "justify-center px-0",
                active
                  ? "bg-primary-foreground/15 font-medium text-primary-foreground"
                  : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!effectiveCollapsed && <span className="flex-1">{label}</span>}
              {isNotifications && unreadCount > 0 && (
                <span
                  className={cn(
                    "bg-rose-500 text-white flex items-center justify-center rounded-full font-semibold",
                    effectiveCollapsed ? "absolute top-0.5 right-0.5 min-w-4 px-1 text-[9px]" : "min-w-5 px-1.5 text-[10px]",
                  )}
                >
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Pushed to the bottom of the rail by mt-auto (the <aside> is
          flex-col) -- a compact, inviting mascot-led entry point rather
          than a plain "?" icon, always mounted regardless of collapse
          state so the first-visit auto-open effect keeps running either
          way (see TourTrigger). */}
      <div className="mt-auto px-3 pb-3">
        {!effectiveCollapsed && fullName && (
          <p className="text-primary-foreground/70 mb-2 truncate text-xs">Hoş geldin, {fullName}</p>
        )}
        <TourTrigger role="coach" welcome={COACH_WELCOME_STEP} items={COACH_NAV_ITEMS} landingPath={COACH_LANDING_PATH} collapsed={effectiveCollapsed} />
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
