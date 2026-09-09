"use client";

import { usePathname } from "next/navigation";

import type { CoachAnnouncement } from "@/lib/announcements";
import { AnnouncementSideWidget } from "./announcement-side-widget";

// Coach-panel mirror of the student/parent AnnouncementCenter, minus the
// once-per-day popup dialog those two have -- just the collapsible side
// widget, shown only on the coach's real home page (/coach itself only
// redirects to /coach/dashboard, so that's the page to gate on).
export function AnnouncementCenter({ announcements }: { announcements: CoachAnnouncement[] }) {
  const pathname = usePathname();

  if (announcements.length === 0) return null;

  const showWidget = pathname === "/coach/dashboard";

  return showWidget ? <AnnouncementSideWidget announcements={announcements} /> : null;
}
