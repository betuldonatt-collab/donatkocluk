// Shared pastel-green progress shading -- originally built for the LGS vocab
// quiz (lib/lgs-vocab.ts) but genuinely feature-agnostic: any "how much of
// this have you finished" bar or per-step dot indicator can reuse it.
// Extracted here when the 11th-grade Maarif curriculum dashboard became the
// second consumer, rather than importing color logic out of a module named
// for an unrelated feature.

// --- Progress bar shading ----------------------------------------------------
//
// A progress bar "levels up" through soft green shades as completion grows,
// instead of staying one flat fill color at every percentage. Five fixed
// steps (not a continuous gradient) so the level-up actually reads as
// discrete, step-by-step progress at a glance -- all five stay in the same
// soft/muted range (low-to-moderate saturation, high lightness) so even the
// deepest, 80-100% step is a deeper PASTEL, never a bright/neon green.
const PASTEL_GREEN_HUE = 142;
const PASTEL_GREEN_STEPS: { saturation: number; lightness: number }[] = [
  { saturation: 35, lightness: 88 }, // 0-20%: barely-there mint
  { saturation: 38, lightness: 78 }, // 20-40%
  { saturation: 40, lightness: 68 }, // 40-60%
  { saturation: 42, lightness: 58 }, // 60-80%
  { saturation: 45, lightness: 48 }, // 80-100%: deepest step -- still a soft sage, not neon emerald
];

// Clamped to 0-100 so a slightly out-of-range caller (rounding, a completed
// count briefly ahead of a stale total mid-update) never indexes past the
// array instead of just clamping to the last step.
export function pastelGreenStepForProgress(pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.min(PASTEL_GREEN_STEPS.length - 1, Math.floor(clamped / 20));
}

// `alpha` lets the same step double as a soft background/border tint (e.g.
// a completed card's own accent) without needing a second color scale.
export function pastelGreenForProgress(pct: number, alpha = 1): string {
  const { saturation, lightness } = PASTEL_GREEN_STEPS[pastelGreenStepForProgress(pct)];
  return `hsl(${PASTEL_GREEN_HUE} ${saturation}% ${lightness}% / ${alpha})`;
}

// --- Per-step dot indicator ---------------------------------------------------
//
// A small discrete "leveling up" indicator (e.g. the vocab quiz's per-word
// streak dots) -- a SEPARATE, directly-interpolated 2-point scale rather than
// indexing into the bar's five 20%-wide buckets above: with only a handful of
// dots in play, bucketing by (dotIndex+1)/totalDots skips most of those five
// steps entirely and can land the very FIRST dot on the bar's barely-there
// 0-20% shade -- fine smoothed out across a wide, continuous bar, but a
// single small dot at that lightness reads as practically unfilled against a
// light card. Interpolating directly between a dot-sized "clearly lit, still
// soft" starting shade and the bar's own deepest/100% shade keeps the two
// scales part of the same family (hue, saturation range, and the LAST dot of
// any totalDots is pixel-identical to a fully-complete bar's own color)
// while actually being visible one dot at a time.
const STREAK_DOT_START = { saturation: 40, lightness: 72 };
const STREAK_DOT_END = PASTEL_GREEN_STEPS[PASTEL_GREEN_STEPS.length - 1];

// --- Mastery tiers (LGS vocab quiz) ------------------------------------------
//
// Three levels of one word's mastery -- 1 correct answer (light), 2 (medium), 3 or more (the deepest step, the same shade as a
// fully-complete bar) -- each a clearly different green, still inside the pastel family. 0 correct answers has no shade.
export type MasteryLevel = 0 | 1 | 2 | 3;

const MASTERY_TIER_SHADES: Record<1 | 2 | 3, { saturation: number; lightness: number }> = {
  1: STREAK_DOT_START, // light
  2: { saturation: 42, lightness: 60 }, // medium
  3: STREAK_DOT_END, // solid / max mastery
};

export function masteryTierColor(level: 1 | 2 | 3, alpha = 1): string {
  const { saturation, lightness } = MASTERY_TIER_SHADES[level];
  return `hsl(${PASTEL_GREEN_HUE} ${saturation}% ${lightness}% / ${alpha})`;
}

export function pastelGreenForStreakDot(dotIndex: number, totalDots: number): string {
  const t = totalDots <= 1 ? 1 : dotIndex / (totalDots - 1);
  const saturation = Math.round(STREAK_DOT_START.saturation + (STREAK_DOT_END.saturation - STREAK_DOT_START.saturation) * t);
  const lightness = Math.round(STREAK_DOT_START.lightness + (STREAK_DOT_END.lightness - STREAK_DOT_START.lightness) * t);
  return `hsl(${PASTEL_GREEN_HUE} ${saturation}% ${lightness}% / 1)`;
}
