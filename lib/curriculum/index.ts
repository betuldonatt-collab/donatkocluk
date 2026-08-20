// Generated from the official curriculum workbooks by
// scripts/parse-curriculum.mjs — do not hand-edit the JSON files; re-run
// the script instead. See lib/curriculum/*.json.
import tytJson from "./tyt.json";
import aytSayisalJson from "./ayt-sayisal.json";
import aytEaJson from "./ayt-ea.json";
import aytSozelJson from "./ayt-sozel.json";

export type Topic = { id: string; name: string; frequency?: Record<string, number> };
export type Unit = { unit: string; topics: Topic[] };
export type Course = { id: string; name: string; units: Unit[] };

export const TYT_COURSES: Course[] = tytJson as Course[];

export type Track = "sayisal" | "ea" | "sozel";

export const TRACK_LABELS: Record<Track, string> = {
  sayisal: "Sayısal",
  ea: "Eşit Ağırlık",
  sozel: "Sözel",
};

export const AYT_COURSES_BY_TRACK: Record<Track, Course[]> = {
  sayisal: aytSayisalJson as Course[],
  ea: aytEaJson as Course[],
  sozel: aytSozelJson as Course[],
};
