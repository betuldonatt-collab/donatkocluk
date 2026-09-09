import Image from "next/image";

import { cn } from "@/lib/utils";

// "Donat Koçluk" brand mascot -- a custom-drawn raster asset
// (public/mascot.png, pre-sized to 256x256, RGBA). The source file as
// originally supplied had a flat white studio background baked in (RGB,
// no alpha) -- mix-blend-multiply was tried first to fake transparency,
// but multiply only erases white against a LIGHT surface; against this
// app's dark sidebar rail (bg-primary) it turned the white square into a
// visible dark box instead (multiplying white by a dark color still
// darkens it), and would also muddy the mascot's own colors there since
// multiply applies to every opaque pixel, not just the old background. So
// the background was actually removed (near-white pixels keyed out to
// real alpha, with a short falloff band to keep the line art's
// anti-aliased edges soft) rather than patched over with a blend mode.
//
// `unoptimized` is required, not just a size micro-optimization: routing
// this through Next's own /_next/image resizer flattened the alpha
// straight back onto a white background during its own resize/encode
// step (confirmed by comparing the raw file, which renders with correct
// transparency, against the optimizer's output, which didn't) -- so this
// asset is pre-sized by hand instead and served as-is, which also happens
// to be the right call for something this small and only ever shown at
// icon size. object-contain keeps the mascot's own proportions intact
// regardless of what aspect ratio className ends up forcing on it.
//
// contrastBg wraps the mascot in a small white pill (padding + shadow +
// a faint ring). Transparency alone is correct on a light page (nothing
// to contrast against), but the artwork's own darker linework/shading can
// still lose definition sitting directly on this app's dark sidebar rail
// (bg-primary) -- a plain background swap wouldn't help there the way it
// does on a page, since bg-primary isn't a light/dark-mode-conditional
// color, it's just always dark. Pass this prop at exactly those dark,
// fixed-background call sites (the four sidebar headers); leave it off
// everywhere else so a page usage doesn't grow a background box it
// doesn't need.
export function Logo({ className, contrastBg = false }: { className?: string; contrastBg?: boolean }) {
  const image = (
    <Image
      src="/mascot.png"
      alt="Donat Koçluk"
      width={256}
      height={256}
      unoptimized
      className={cn("object-contain", className)}
    />
  );

  if (!contrastBg) return image;

  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-md ring-1 ring-black/10">
      {image}
    </span>
  );
}
