import Image from "next/image";

import { cn } from "@/lib/utils";

// Official "Donat Koçluk" mark -- the blue origami paper plane
// (public/brand-logo.png, 256x256 RGBA, transparent background). Served
// `unoptimized` on purpose: it is already pre-sized and Next's resizer
// has flattened alpha in this app before.
//
// contrastBg puts the mark on a small white pill, for the dark, fixed
// sidebar rails where the navy plane would otherwise vanish. showTitle
// adds the platform name beside the mark.
export function BrandLogo({
  className,
  contrastBg = false,
  showTitle = false,
  titleClassName,
}: {
  className?: string;
  contrastBg?: boolean;
  showTitle?: boolean;
  titleClassName?: string;
}) {
  const image = (
    <Image
      src="/brand-logo.png"
      alt={showTitle ? "" : "Donat Koçluk"}
      width={256}
      height={256}
      unoptimized
      className={cn("object-contain", className)}
    />
  );

  const mark = contrastBg ? (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-md ring-1 ring-black/10">
      {image}
    </span>
  ) : (
    image
  );

  if (!showTitle) return mark;

  return (
    <span className="inline-flex items-center gap-2">
      {mark}
      <span className={cn("font-semibold tracking-tight", titleClassName)}>Donat Koçluk</span>
    </span>
  );
}
