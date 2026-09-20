// Shared by the LGS Paragraf / Kitap Okuma page, its client and its server
// actions. Backed by lgs_daily_routines (migration 0087): one row per
// (student, day) holding BOTH the day's Paragraf session and its Kitap
// Okuma page count, each optional -- a day can carry just one of them.
export type LgsParagrafEntry = { dogru: number; yanlis: number; bos: number; sure: number | null; net: number };
export type LgsKitapEntry = { pages: number; title: string | null; author: string | null };

export type LgsHistoryEntry = {
  id: string;
  date: string;
  // null = nothing logged for that half of the day
  paragraf: LgsParagrafEntry | null;
  kitap: LgsKitapEntry | null;
};
