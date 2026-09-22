"use client";

import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";
import { useMobileNavOpen } from "@/lib/use-mobile-nav-open";

// `sidebar` is passed as a plain, already-rendered element (e.g.
// <CoachSidebar unreadCount={5} />) from a server-component layout, never
// as a function -- a Server Component can't pass a function prop into a
// Client Component (it isn't serializable across that boundary). This
// component and the sidebar it's given both call useSidebarCollapsed()
// AND useMobileNavOpen() independently; since both hooks read from one
// shared external source, every consumer stays in sync without any of
// them needing to lift state into the other.
//
// Production-hardening audit (2026-09-09), pillar 2: below md (768px)
// this used to render the sidebar at its full fixed width with no
// off-canvas behavior at all -- on a real phone the rail alone consumed
// most of the screen, on every single page in every panel, since
// DashboardShell is the one shared wrapper all four panels render
// through. The sidebar itself now goes off-canvas by default below md
// (see each Sidebar's own -translate-x-full md:translate-x-0 classes);
// this hamburger + backdrop is what slides it back in.
export function DashboardShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const { collapsed } = useSidebarCollapsed();
  const { open: mobileOpen, setOpen: setMobileOpen, toggle: toggleMobileNav } = useMobileNavOpen();

  return (
    <div className="flex flex-1">
      <button
        type="button"
        onClick={toggleMobileNav}
        aria-label={mobileOpen ? "Menüyü kapat" : "Menüyü aç"}
        aria-expanded={mobileOpen}
        // text-primary (not text-foreground): the brand's own navy/blue
        // (oklch hue 265, same as --primary everywhere else) rather than
        // the plain neutral foreground color, so this icon reads as a
        // deliberate, on-brand control -- and stays a real, opaque color
        // in both themes (dark navy on the light card, light blue on the
        // dark one) instead of ever risking blending into bg-card.
        className="bg-card text-primary border-primary/30 fixed top-3 left-3 z-50 flex size-10 items-center justify-center rounded-lg border shadow-sm md:hidden print:hidden"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      <div className="print:hidden">{sidebar}</div>
      <main
        className={cn(
          // Off-canvas below md means the sidebar takes no layout space
          // there regardless of collapsed/expanded -- ml-0 always wins
          // below md since Tailwind's unprefixed classes are the base
          // (mobile) value and md: only overrides at that breakpoint and
          // up.
          "ml-0 flex-1 transition-[margin-left] duration-200 ease-in-out print:ml-0",
          collapsed ? "md:ml-16" : "md:ml-64",
        )}
      >
        {children}
      </main>
    </div>
  );
}
