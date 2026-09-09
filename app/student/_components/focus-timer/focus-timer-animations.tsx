import {
  BookOpen,
  Check,
  Coffee,
  FlaskConical,
  Heart,
  Leaf,
  Pencil,
  Rocket,
  Smile,
  Sparkle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// A pool of cozy, infinite-loop background decorations for the Focus
// Timer modal -- purely decorative (aria-hidden, pointer-events-none),
// built entirely from Tailwind's built-in animate-pulse/bounce so no
// custom keyframes/CSS file is needed. One is picked at random each time
// the modal mounts (see FocusTimerModal), just to keep repeat sessions
// feeling fresh rather than staring at the exact same loop every time.
//
// Every variant shares the same "scattered floating particles" shape --
// a handful of small icons/glyphs at fixed screen positions, each
// independently pulsing/bouncing with its own delay -- rather than one
// big centered graphic, so growing the pool means adding an icon +
// color, not hand-writing new layout JSX each time.

type ParticleSpot = { top: string; left: string; size: number; delay: string };

// 12 spots mixing small (~14-16px) / medium (~18-22px) / large (~28-32px)
// sizes, interleaved rather than grouped, so the field reads as natural
// depth-of-field instead of a uniform grid of same-size icons.
const DEFAULT_LAYOUT: ParticleSpot[] = [
  { top: "8%", left: "12%", size: 14, delay: "0s" },
  { top: "14%", left: "50%", size: 30, delay: "0.4s" },
  { top: "18%", left: "85%", size: 18, delay: "0.9s" },
  { top: "30%", left: "30%", size: 22, delay: "0.2s" },
  { top: "34%", left: "68%", size: 14, delay: "1.1s" },
  { top: "46%", left: "10%", size: 28, delay: "0.6s" },
  { top: "50%", left: "90%", size: 16, delay: "1.4s" },
  { top: "58%", left: "46%", size: 20, delay: "0.3s" },
  { top: "66%", left: "20%", size: 32, delay: "0.8s" },
  { top: "72%", left: "76%", size: 14, delay: "0.5s" },
  { top: "84%", left: "40%", size: 22, delay: "1.2s" },
  { top: "90%", left: "62%", size: 18, delay: "0.7s" },
];

// icon may be a single icon (every particle uses it) or an array of icons
// cycled across positions (e.g. mixing FlaskConical/TestTube), the same
// cycling technique ScatteredGlyphs already uses for its symbol set.
function ScatteredParticles({
  icon,
  className,
  animationClass = "animate-pulse",
  duration = "2.2s",
  layout = DEFAULT_LAYOUT,
}: {
  icon: LucideIcon | LucideIcon[];
  className: string;
  animationClass?: string;
  duration?: string;
  layout?: ParticleSpot[];
}) {
  const icons = Array.isArray(icon) ? icon : [icon];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {layout.map((spot, i) => {
        const Icon = icons[i % icons.length];
        return (
          <Icon
            key={i}
            className={cn("absolute", animationClass, className)}
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.size,
              height: spot.size,
              animationDelay: spot.delay,
              animationDuration: duration,
            }}
          />
        );
      })}
    </div>
  );
}

// Math symbols aren't a single icon -- each scattered spot gets a
// different glyph from the set, cycling if there are more spots than
// glyphs.
function ScatteredGlyphs({
  glyphs,
  className,
  layout = DEFAULT_LAYOUT,
}: {
  glyphs: string[];
  className: string;
  layout?: ParticleSpot[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {layout.map((spot, i) => (
        <span
          key={i}
          className={cn("absolute animate-pulse font-bold select-none [animation-duration:2.2s]", className)}
          style={{ top: spot.top, left: spot.left, fontSize: spot.size, animationDelay: spot.delay }}
        >
          {glyphs[i % glyphs.length]}
        </span>
      ))}
    </div>
  );
}

// Plain glowing dots -- no icon, for the softest/least busy variant.
function ScatteredOrbs({ className, layout = DEFAULT_LAYOUT }: { className: string; layout?: ParticleSpot[] }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {layout.map((spot, i) => (
        <span
          key={i}
          className={cn("absolute animate-pulse rounded-full [animation-duration:2.6s]", className)}
          style={{ top: spot.top, left: spot.left, width: spot.size * 1.6, height: spot.size * 1.6, animationDelay: spot.delay }}
        />
      ))}
    </div>
  );
}

function FloatingStars() {
  return <ScatteredParticles icon={Sparkle} className="text-amber-400/60" />;
}

function FloatingStudyBooks() {
  return <ScatteredParticles icon={BookOpen} className="text-sky-500/55" animationClass="animate-bounce" duration="2.8s" />;
}

function PulsingHearts() {
  return <ScatteredParticles icon={Heart} className="fill-rose-500/40 text-rose-500/55" />;
}

function BouncingPencils() {
  return <ScatteredParticles icon={Pencil} className="text-amber-600/55" animationClass="animate-bounce" duration="2.4s" />;
}

function SteamingCoffeeCups() {
  return <ScatteredParticles icon={Coffee} className="text-orange-600/55" />;
}

const MATH_GLYPHS = ["π", "∑", "÷", "√", "×", "∞"];

function GlowingMathSymbols() {
  return <ScatteredGlyphs glyphs={MATH_GLYPHS} className="text-indigo-500/55" />;
}

function TinyCheckmarks() {
  return <ScatteredParticles icon={Check} className="text-emerald-500/60" animationClass="animate-bounce" duration="2.6s" />;
}

function FloatingLeafSprouts() {
  return <ScatteredParticles icon={Leaf} className="text-emerald-600/55" />;
}

function SoftSparkles() {
  return <ScatteredParticles icon={Sparkles} className="text-violet-400/40" duration="3s" />;
}

function TinyFlyingRockets() {
  return <ScatteredParticles icon={Rocket} className="text-sky-600/55" animationClass="animate-bounce" duration="2.3s" />;
}

function FloatingSmileyFaces() {
  return <ScatteredParticles icon={Smile} className="text-amber-500/55" />;
}

function FloatingSoftOrbs() {
  return <ScatteredOrbs className="bg-primary/20" />;
}

function BubblingLabFlasks() {
  return <ScatteredParticles icon={FlaskConical} className="text-teal-500/55" duration="2.4s" />;
}

export const FOCUS_TIMER_ANIMATION_COUNT = 13;

// Returns an index rather than the component itself -- picking a component
// reference via a hook and rendering it as <Picked /> trips the
// react-hooks/static-components rule (components must be static
// references, never values computed during render), even though this
// particular pick is genuinely stable per mount. An index sidesteps that
// entirely; see FocusTimerBackground below for the static-reference render.
export function randomFocusTimerAnimationIndex() {
  return Math.floor(Math.random() * FOCUS_TIMER_ANIMATION_COUNT);
}

export function FocusTimerBackground({ index }: { index: number }) {
  switch (index % FOCUS_TIMER_ANIMATION_COUNT) {
    case 0:
      return <FloatingStars />;
    case 1:
      return <FloatingStudyBooks />;
    case 2:
      return <PulsingHearts />;
    case 3:
      return <BouncingPencils />;
    case 4:
      return <SteamingCoffeeCups />;
    case 5:
      return <GlowingMathSymbols />;
    case 6:
      return <TinyCheckmarks />;
    case 7:
      return <FloatingLeafSprouts />;
    case 8:
      return <SoftSparkles />;
    case 9:
      return <TinyFlyingRockets />;
    case 10:
      return <FloatingSmileyFaces />;
    case 11:
      return <FloatingSoftOrbs />;
    default:
      return <BubblingLabFlasks />;
  }
}
