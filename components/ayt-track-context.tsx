"use client";

import { createContext, useContext } from "react";

import type { Track } from "@/lib/curriculum";

// The AYT track (Sayısal / Eşit Ağırlık / Sözel) of the student whose coach page is being rendered, or null when it
// is not known (not a YKS student, or no track set). Provided once near the top of the coach student pages, next to
// the Maarif grade, so the task form can read it without a prop threaded through a dozen components. It only decides
// WHICH variant of a course shared by two tracks ("AYT Matematik" exists for both Sayısal and EA) the form lists.
const AytTrackContext = createContext<Track | null>(null);

export function AytTrackProvider({ value, children }: { value: Track | null; children: React.ReactNode }) {
  return <AytTrackContext.Provider value={value}>{children}</AytTrackContext.Provider>;
}

export function useAytTrack(): Track | null {
  return useContext(AytTrackContext);
}
