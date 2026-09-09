// The sections a real general exam ("Genel Deneme") is scored in. AYT
// general exams have no course_id at all (see student_tasks.subject_scores),
// so their track (sayisal/ea/sozel) is recovered from which of the disjoint
// key-sets below is present in a given exam's subject_scores -- see
// inferAytTrackFromScores.
import { AYT_COURSES_BY_TRACK, TYT_COURSES, type Course, type Track } from "./index";

export type SubjectGroupKey = "turkce" | "sosyal" | "matematik" | "fen";

export const TYT_SUBJECT_GROUPS: { key: SubjectGroupKey; label: string; courseIds: string[] }[] = [
  { key: "turkce", label: "Türkçe", courseIds: ["tyt-turkce"] },
  { key: "sosyal", label: "Sosyal Bilimler", courseIds: ["tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"] },
  { key: "matematik", label: "Matematik", courseIds: ["tyt-matematik", "tyt-geometri"] },
  { key: "fen", label: "Fen Bilimleri", courseIds: ["tyt-fizik", "tyt-kimya", "tyt-biyoloji"] },
];

export function coursesForGroup(key: SubjectGroupKey) {
  const group = TYT_SUBJECT_GROUPS.find((g) => g.key === key);
  if (!group) return [];
  return group.courseIds
    .map((id) => TYT_COURSES.find((c) => c.id === id))
    .filter((c): c is (typeof TYT_COURSES)[number] => !!c);
}

export type AytSubjectGroupKey =
  | "ayt_matematik"
  | "ayt_fizik"
  | "ayt_kimya"
  | "ayt_biyoloji"
  | "ayt_ea_sozel1"
  | "ayt_ea_matematik"
  | "ayt_sozel_sozel1"
  | "ayt_sozel_sosyal2";

export const AYT_SUBJECT_GROUPS_BY_TRACK: Record<
  Track,
  { key: AytSubjectGroupKey; label: string; courseIds: string[] }[]
> = {
  sayisal: [
    { key: "ayt_matematik", label: "Matematik", courseIds: ["ayt-matematik-sayisal", "ayt-geometri-sayisal"] },
    { key: "ayt_fizik", label: "Fizik", courseIds: ["ayt-fizik"] },
    { key: "ayt_kimya", label: "Kimya", courseIds: ["ayt-kimya"] },
    { key: "ayt_biyoloji", label: "Biyoloji", courseIds: ["ayt-biyoloji"] },
  ],
  ea: [
    {
      key: "ayt_ea_sozel1",
      label: "Türk Dili ve Edebiyatı - Sosyal Bilimler 1",
      courseIds: ["ayt-edebiyat-ea", "ayt-tarih-1-ea", "ayt-cografya-1-ea"],
    },
    { key: "ayt_ea_matematik", label: "Matematik", courseIds: ["ayt-matematik-ea", "ayt-geometri-ea"] },
  ],
  sozel: [
    {
      key: "ayt_sozel_sozel1",
      label: "Türk Dili ve Edebiyatı - Sosyal Bilimler 1",
      courseIds: ["ayt-edebiyat-sozel", "ayt-tarih-1-sozel", "ayt-cografya-1-sozel"],
    },
    {
      key: "ayt_sozel_sosyal2",
      label: "Sosyal Bilimler 2",
      courseIds: [
        "ayt-tarih-2",
        "ayt-cografya-2",
        "ayt-felsefe",
        "ayt-psikoloji",
        "ayt-sosyoloji",
        "ayt-mantik",
        "ayt-din-kulturu-ve-ahlak-bilgisi",
      ],
    },
  ],
};

export function coursesForAytGroup(track: Track, key: string): Course[] {
  const group = AYT_SUBJECT_GROUPS_BY_TRACK[track].find((g) => g.key === key);
  if (!group) return [];
  const courses = AYT_COURSES_BY_TRACK[track];
  return group.courseIds
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => !!c);
}

// Recovers which AYT track a general exam's already-saved subject_scores
// belong to, by checking which track's disjoint key-set is present. Returns
// null for TYT-shaped scores, empty scores, or legacy AYT rows saved before
// this file supported AYT (which used the TYT-shaped keys by mistake).
export function inferAytTrackFromScores(scores: Record<string, unknown> | null | undefined): Track | null {
  if (!scores) return null;
  for (const track of Object.keys(AYT_SUBJECT_GROUPS_BY_TRACK) as Track[]) {
    if (AYT_SUBJECT_GROUPS_BY_TRACK[track].some((g) => g.key in scores)) return track;
  }
  return null;
}
