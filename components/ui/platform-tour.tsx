"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { resolveTourSteps, type TourNavItem } from "@/lib/tour-steps";
import { useTourCompleted } from "@/lib/use-tour-completed";
import { useMobileNavOpen } from "@/lib/use-mobile-nav-open";
import { cn } from "@/lib/utils";

export type TourStep = {
  title: string;
  description: string;
  /**
   * CSS selector for the element this step spotlights (see
   * lib/tour-steps.ts's navTarget -- every sidebar link carries a
   * matching data-tour={href} attribute). Omitted for plain intro/outro
   * steps, which render as a centered card with no cutout.
   */
  target?: string;
};

const SPOTLIGHT_PADDING = 8;
const GROUP_WIDTH_ESTIMATE = 380;
const GROUP_HEIGHT_ESTIMATE = 200;
const VIEWPORT_MARGIN = 16;
// Below this, side-anchored placement (mascot+card beside the spotlighted
// element) has nowhere near enough room -- GROUP_WIDTH_ESTIMATE alone
// (380px) already exceeds a 375px phone's entire viewport, which used to
// push the bubble to a NEGATIVE left offset and render it partly
// off-screen. Below the threshold, the tour always falls back to the
// centered layout (still spotlights the target -- the cutout/ring don't
// depend on bubble placement -- just doesn't try to hug its side).
const NARROW_VIEWPORT_BREAKPOINT = 640;

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

function readRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

// Tracks the current step's spotlighted element across scroll/resize (and
// scrolls it into view first, in case it's off-screen -- a sidebar link
// below the fold, say) -- re-measured via event listeners rather than a
// continuous rAF loop, since the target only actually moves in response
// to one of those. Returns null both when the step has no target and
// when the target selector doesn't currently match anything in the DOM
// (e.g. a deep-dive step re-targeting a collapsed sidebar) -- either way
// PlatformTour falls back to a plain centered card.
function useSpotlightRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The only setRect calls live in here, and this is only ever invoked
    // from a rAF/timeout/event-listener callback below -- never
    // synchronously at the top of the effect body (react-hooks' set-
    // state-in-effect rule flags that shape, since it forces an extra
    // render pass before the browser has even painted the first one).
    function measure() {
      if (cancelled) return;
      setRect(selector ? readRect(selector) : null);
    }

    const el = selector ? document.querySelector(selector) : null;
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    const raf = requestAnimationFrame(measure);
    const settleTimer = setTimeout(measure, 350); // after the smooth scroll above settles
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);

  return rect;
}

// Same shape as useSpotlightRect: only ever setState from an event
// listener callback, never synchronously in the effect body.
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

type BubblePlacement = { top: number; left: number; side: "left" | "right" };

function computeBubblePlacement(rect: Rect): BubblePlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceRight = vw - rect.right;
  const spaceLeft = rect.left;
  const side: "left" | "right" = spaceRight >= spaceLeft ? "right" : "left";

  const left =
    side === "right"
      ? Math.max(Math.min(rect.right + 16, vw - GROUP_WIDTH_ESTIMATE - VIEWPORT_MARGIN), VIEWPORT_MARGIN)
      : Math.min(Math.max(rect.left - GROUP_WIDTH_ESTIMATE - 16, VIEWPORT_MARGIN), Math.max(vw - GROUP_WIDTH_ESTIMATE - VIEWPORT_MARGIN, VIEWPORT_MARGIN));

  const idealTop = rect.top + rect.height / 2 - GROUP_HEIGHT_ESTIMATE / 2;
  const top = Math.min(Math.max(idealTop, VIEWPORT_MARGIN), vh - GROUP_HEIGHT_ESTIMATE - VIEWPORT_MARGIN);

  return { top, left, side };
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// The tour overlay itself. Two rendering modes, chosen per step:
//
// - No target, OR the viewport is too narrow for side-anchored placement
//   to fit (see NARROW_VIEWPORT_BREAKPOINT), OR the target isn't
//   currently in the DOM: a plain centered card over a single full-screen
//   dim+blur backdrop -- used for the welcome step and as a safe
//   fallback. The spotlight cutout itself (see `hole` below) still shows
//   on a narrow viewport even in this mode -- only the card/mascot's
//   POSITION relative to it is what falls back to centered.
// - Has a target and enough room: the backdrop is split into four panels
//   that tile the viewport MINUS the target's own rect (plus a little
//   padding), so the target sits in a genuine gap with nothing drawn over
//   it at all -- dimmed/blurred everywhere else, sharp and "popped" right
//   where it needs to be, with a glowing ring drawn around the gap. The
//   mascot + speech bubble are positioned right up against whichever side
//   of the target has more room, and the mascot itself is mirrored so its
//   raised arm always gestures toward the target rather than away from
//   it.
function PlatformTour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const rect = useSpotlightRect(step.target);
  const viewportWidth = useViewportWidth();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = "platform-tour-title";
  const descId = "platform-tour-desc";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Initial focus, once, on mount -- moves keyboard focus into the dialog
  // so a keyboard user isn't left tabbing around a trigger button that's
  // now visually covered by the overlay. Deliberately doesn't re-run per
  // step (see the index dep list below is NOT included) -- re-stealing
  // focus on every Next/Back click would be disorienting for a screen
  // reader user mid-read.
  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onFinish();
        return;
      }
      if (e.key === "ArrowRight") {
        setIndex((i) => (i < steps.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === "ArrowLeft") {
        setIndex((i) => (i > 0 ? i - 1 : i));
        return;
      }
      if (e.key !== "Tab") return;

      // Focus trap: the tour has no portal, so without this Tab would
      // walk straight into the (visually dimmed, but still perfectly
      // focusable) sidebar links and page content behind it. Re-queries
      // the live focusable set on every keypress rather than caching it,
      // since it genuinely changes step to step (e.g. "Geri" only exists
      // once index > 0).
      const container = cardRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [steps.length, onFinish]);

  function goNext() {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }

  const isNarrow = viewportWidth < NARROW_VIEWPORT_BREAKPOINT;
  // On a phone the sidebar targets sit in an off-canvas drawer, so a
  // cutout would spotlight an invisible/hidden element -- skip it and
  // show the tour as a bottom sheet instead.
  const hole = rect && !isNarrow
    ? {
        top: Math.max(rect.top - SPOTLIGHT_PADDING, 0),
        left: Math.max(rect.left - SPOTLIGHT_PADDING, 0),
        right: Math.min(rect.right + SPOTLIGHT_PADDING, window.innerWidth),
        bottom: Math.min(rect.bottom + SPOTLIGHT_PADDING, window.innerHeight),
      }
    : null;

  const bubble = rect && !isNarrow ? computeBubblePlacement(rect) : null;
  const mascotFlipped = bubble?.side === "right";

  const panelClass = "absolute bg-black/45 backdrop-blur-sm transition-all duration-300 ease-out";

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      className={cn(
        // text-foreground here is load-bearing, not decorative: this
        // whole overlay is mounted from inside the sidebar (TourTrigger
        // lives in its footer row), which sets text-primary-foreground
        // (near-white) on the <aside> itself -- color is inherited, so
        // anything in the card that doesn't set its own explicit text
        // color (e.g. Button's outline variant, used by "Geri" below)
        // would otherwise silently pick up that near-white ancestor
        // color and become unreadable against this card's own light
        // bg-card. Establishing the correct color here, at the card
        // root, is more robust than patching individual descendants one
        // at a time.
        //
        // w-[340px] is the ideal width; max-w-[min(...)] clamps it down
        // on any viewport too narrow for that (a phone, mainly) --
        // applied unconditionally (not just in centered mode) since the
        // side-anchored mode is also skipped below
        // NARROW_VIEWPORT_BREAKPOINT anyway (see `bubble` above), so this
        // never needs to coexist with a mascot squeezed in beside it on a
        // screen too small for that.
        isNarrow
          ? "border-border bg-card text-foreground relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl outline-none"
          : "border-border bg-card text-foreground relative w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border p-4 shadow-xl transition-all duration-300 outline-none",
      )}
    >
      {/* Speech-bubble tail. Centered/bottom when there's no target
          (mascot sits directly below); on whichever edge faces the
          mascot when spotlighting a target. */}
      <span
        className={cn(
          "bg-card border-border absolute size-4 rotate-45 border-r border-b",
          isNarrow
            ? "hidden"
            : bubble
            ? cn("top-1/2 -translate-y-1/2", mascotFlipped ? "-left-2 rotate-[135deg]" : "-right-2 rotate-[-45deg]")
            : "-bottom-2 left-6",
        )}
        aria-hidden
      />

      <button
        type="button"
        onClick={onFinish}
        aria-label="Turu kapat"
        className={cn("border-border bg-card text-muted-foreground hover:text-foreground absolute z-10 flex size-7 items-center justify-center rounded-full border shadow-sm transition-colors", isNarrow ? "top-3 right-3" : "-top-3 -right-3")}
      >
        <X className="size-4" />
      </button>

      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        Adım {index + 1} / {steps.length}
      </p>
      <h2 id={titleId} className="text-foreground mt-1 text-base font-semibold">
        {step.title}
      </h2>
      <p id={descId} className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        {step.description}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onFinish}
          className="text-muted-foreground hover:text-foreground"
        >
          Turu Bitir / Atla
        </Button>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button type="button" variant="outline" size="sm" onClick={() => setIndex((i) => i - 1)}>
              <ChevronLeft className="size-4" />
              Geri
            </Button>
          )}
          <Button type="button" size="sm" onClick={goNext}>
            {isLast ? "Bitir" : "İleri"}
            {!isLast && <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full transition-colors", i === index ? "bg-primary" : "bg-muted-foreground/30")}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );

  const mascot = (
    <div className="mb-1 shrink-0" style={mascotFlipped ? { transform: "scaleX(-1)" } : undefined}>
      <BrandLogo className="size-16" />
    </div>
  );

  const overlay = (
    <div className="fixed inset-0 z-[60]">
      {hole ? (
        <>
          <div className={panelClass} style={{ top: 0, left: 0, width: "100%", height: hole.top }} />
          <div className={panelClass} style={{ top: hole.bottom, left: 0, width: "100%", height: `calc(100% - ${hole.bottom}px)` }} />
          <div className={panelClass} style={{ top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top }} />
          <div
            className={panelClass}
            style={{ top: hole.top, left: hole.right, width: `calc(100% - ${hole.right}px)`, height: hole.bottom - hole.top }}
          />
          {/* Glowing ring around the spotlighted element -- what actually
              makes it "pop": nothing dims/blurs it, and this adds a
              bright edge on top of that gap. */}
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.15)] transition-all duration-300 ease-out"
            style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      )}

      {bubble ? (
        <div
          className="absolute flex items-end gap-3 transition-all duration-300 ease-out"
          style={{ top: bubble.top, left: bubble.left, flexDirection: mascotFlipped ? "row-reverse" : "row" }}
        >
          {card}
          {mascot}
        </div>
      ) : isNarrow ? (
        <div className="absolute inset-x-0 bottom-0">{card}</div>
      ) : (
        <div className="flex h-full items-center justify-center p-4">
          <div className="flex items-end gap-3">
            {mascot}
            {card}
          </div>
        </div>
      )}
    </div>
  );

  // Portaled to <body>: this overlay is mounted from inside the sidebar
  // <aside>, whose translate transform makes it the containing block for
  // position:fixed descendants -- without the portal, "fixed inset-0"
  // was sized/offset relative to the sidebar (the off-screen bug).
  return createPortal(overlay, document.body);
}

// The tour trigger, resolves this panel's currently-relevant steps from
// the route (see resolveTourSteps in lib/tour-steps.ts) and owns the
// opt-in open/close lifecycle (never auto-opens). Mounted once inside
// that panel's sidebar (as a footer row, not the old header "?" button)
// so it's present on every page of the panel; `collapsed` swaps it
// between the full "Rehberi Başlat" row and an icon-only version, but the
// component itself -- and crucially its auto-open effect -- stays
// mounted regardless of collapse state.
export function TourTrigger({
  role,
  welcome,
  items,
  landingPath,
  collapsed,
}: {
  role: string;
  welcome: TourStep;
  items: TourNavItem[];
  landingPath: string;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { markCompleted } = useTourCompleted(role);
  const { setOpen: setMobileNavOpen } = useMobileNavOpen();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const steps = useMemo(() => resolveTourSteps({ welcome, items, landingPath, pathname }), [welcome, items, landingPath, pathname]);

  function handleFinish() {
    setOpen(false);
    markCompleted();
    // Standard modal a11y: return focus to whatever invoked the dialog --
    // harmless even when this close came from an auto-opened tour the
    // user never clicked to open, since resting focus on the trigger is
    // still better than leaving it wherever the focus trap last left it.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setMobileNavOpen(false);
          setOpen(true);
        }}
        aria-label="Rehberi Başlat"
        title="Rehberi Başlat"
        className={cn(
          "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-2.5 rounded-lg py-2 transition-colors",
          collapsed ? "w-full justify-center" : "w-full px-2.5",
        )}
      >
        <BrandLogo className="size-7 shrink-0" contrastBg />
        {!collapsed && <span className="text-sm font-medium">Rehberi Başlat</span>}
      </button>

      {open && <PlatformTour steps={steps} onFinish={handleFinish} />}
    </>
  );
}
