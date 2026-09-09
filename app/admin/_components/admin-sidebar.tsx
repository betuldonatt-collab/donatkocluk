"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, GraduationCap, Home, Settings, UserCog, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { TourTrigger } from "@/components/ui/platform-tour";
import { ADMIN_LANDING_PATH, ADMIN_NAV_ITEMS, ADMIN_WELCOME_STEP } from "@/lib/tour-steps";
import { useIsMobileViewport } from "@/lib/use-is-mobile-viewport";
import { useMobileNavOpen } from "@/lib/use-mobile-nav-open";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/admin", label: "Ana Sayfa", icon: Home },
  { href: "/admin/students", label: "Öğrenci Rehberi", icon: Users },
  { href: "/admin/coaches", label: "Koçlar", icon: GraduationCap },
  { href: "/admin/profile", label: "Profil", icon: UserCog },
  { href: "/admin/settings", label: "Ayarlar", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNavOpen();
  const isMobile = useIsMobileViewport();
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
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
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
              {!effectiveCollapsed && <span className="flex-1">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <TourTrigger role="admin" welcome={ADMIN_WELCOME_STEP} items={ADMIN_NAV_ITEMS} landingPath={ADMIN_LANDING_PATH} collapsed={effectiveCollapsed} />
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
