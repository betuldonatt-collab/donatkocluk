import { computeLgsNet } from "@/lib/scoring";
import type { LgsHistoryEntry } from "./lgs-types";

// Plain module (not "use server") so both the server page and the server
// actions can share it.
export type LgsRoutineRow = {
  id: string;
  entry_date: string;
  paragraf_correct: number;
  paragraf_wrong: number;
  paragraf_empty: number;
  paragraf_duration_minutes: number | null;
  book_title: string | null;
  book_author: string | null;
  book_pages_read: number | null;
};

// A day "has Paragraf" once any of D/Y/B or a duration was recorded; it "has
// Kitap Okuma" once a page count was.
export function mapLgsRow(r: LgsRoutineRow): LgsHistoryEntry {
  const hasParagraf =
    r.paragraf_correct + r.paragraf_wrong + r.paragraf_empty > 0 || (r.paragraf_duration_minutes ?? 0) > 0;
  return {
    id: r.id,
    date: r.entry_date,
    paragraf: hasParagraf
      ? {
          dogru: r.paragraf_correct,
          yanlis: r.paragraf_wrong,
          bos: r.paragraf_empty,
          sure: r.paragraf_duration_minutes,
          net: computeLgsNet(r.paragraf_correct, r.paragraf_wrong),
        }
      : null,
    kitap:
      r.book_pages_read !== null
        ? { pages: r.book_pages_read, title: r.book_title, author: r.book_author }
        : null,
  };
}
