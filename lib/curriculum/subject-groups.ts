// The sections a real general exam ("Genel Deneme") is scored in. AYT
// general exams have no course_id at all (see student_tasks.subject_scores),
// so their track (sayisal/ea/sozel) is recovered from which of the disjoint
// key-sets below is present in a given exam's subject_scores -- see
// inferAytTrackFromScores.
import { MAARIF9_GENEL_DENEME_COURSES } from "./maarif9";
import { AYT_COURSES_BY_TRACK, LGS_COURSES, TYT_COURSES, type Course, type Track } from "./index";

// LGS's real exam is two sessions: Sözel (Türkçe 20, İnkılap 10, Din
// Kültürü 10, İngilizce 10) then Sayısal (Matematik 20, Fen 20). `questions`
// is each subject's real question count -- the same caps 0085 enforces on
// lgs_general_exams, kept here so the shared task UI can enforce them too.
export const LGS_SUBJECT_GROUPS: { key: "sozel" | "sayisal"; label: string; courseIds: string[] }[] = [
  { key: "sozel", label: "SÖZEL", courseIds: ["lgs-turkce", "lgs-inkilap-tarihi", "lgs-din-kulturu", "lgs-ingilizce"] },
  { key: "sayisal", label: "SAYISAL", courseIds: ["lgs-matematik", "lgs-fen-bilimleri"] },
];

export const LGS_QUESTION_COUNTS: Record<string, number> = {
  "lgs-turkce": 20,
  "lgs-inkilap-tarihi": 10,
  "lgs-din-kulturu": 10,
  "lgs-ingilizce": 10,
  "lgs-matematik": 20,
  "lgs-fen-bilimleri": 20,
};

// A real LGS general exam is scored per SUBJECT (six of them, capped at each
// subject's own question count), not per TYT-style group -- so its
// student_tasks.subject_scores are keyed by these six. The keys are
// deliberately `lgs_`-prefixed: TYT's own keys ("turkce", "matematik",
// "fen", ...) would collide with unprefixed ones, and every YKS aggregator
// reading subject_scores would silently start folding LGS scores in.
export const LGS_EXAM_SUBJECTS: {
  key: string;
  label: string;
  section: "SÖZEL" | "SAYISAL";
  courseIds: string[];
  questions: number;
}[] = [
  { key: "lgs_turkce", label: "Türkçe", section: "SÖZEL", courseIds: ["lgs-turkce"], questions: 20 },
  { key: "lgs_inkilap", label: "İnkılap Tarihi", section: "SÖZEL", courseIds: ["lgs-inkilap-tarihi"], questions: 10 },
  { key: "lgs_din", label: "Din Kültürü", section: "SÖZEL", courseIds: ["lgs-din-kulturu"], questions: 10 },
  { key: "lgs_ingilizce", label: "İngilizce", section: "SÖZEL", courseIds: ["lgs-ingilizce"], questions: 10 },
  { key: "lgs_matematik", label: "Matematik", section: "SAYISAL", courseIds: ["lgs-matematik"], questions: 20 },
  { key: "lgs_fen", label: "Fen Bilimleri", section: "SAYISAL", courseIds: ["lgs-fen-bilimleri"], questions: 20 },
];

export function coursesForLgsExamSubject(key: string): Course[] {
  const subject = LGS_EXAM_SUBJECTS.find((s) => s.key === key);
  if (!subject) return [];
  return subject.courseIds.map((id) => LGS_COURSES.find((c) => c.id === id)).filter((c): c is Course => !!c);
}

// The LGS Ders picker: SÖZEL subjects first, then SAYISAL, each option
// tagged with its group so the combobox can render the two headings.
export function lgsCourseOptions(): { id: string; label: string; group: string }[] {
  return LGS_SUBJECT_GROUPS.flatMap((g) => coursesForLgsGroup(g.key).map((c) => ({ id: c.id, label: c.name, group: g.label })));
}

export function coursesForLgsGroup(key: string): Course[] {
  const group = LGS_SUBJECT_GROUPS.find((g) => g.key === key);
  if (!group) return [];
  return group.courseIds
    .map((id) => LGS_COURSES.find((c) => c.id === id))
    .filter((c): c is Course => !!c);
}

export type SubjectGroupKey = "turkce" | "sosyal" | "matematik" | "fen";

// `questions` is each section's real, fixed TYT question count (ÖSYM's own
// format: 120 total) -- kept here, next to the group it belongs to, so the
// shared task UI can derive Boş from Doğru/Yanlış instead of asking for it,
// and refuse a section whose total doesn't match its own fixed count. Mirrors
// LGS_EXAM_SUBJECTS' own `questions` above exactly.
export const TYT_SUBJECT_GROUPS: { key: SubjectGroupKey; label: string; courseIds: string[]; questions: number }[] = [
  { key: "turkce", label: "Türkçe", courseIds: ["tyt-turkce"], questions: 40 },
  { key: "sosyal", label: "Sosyal Bilimler", courseIds: ["tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"], questions: 20 },
  { key: "matematik", label: "Matematik", courseIds: ["tyt-matematik", "tyt-geometri"], questions: 40 },
  { key: "fen", label: "Fen Bilimleri", courseIds: ["tyt-fizik", "tyt-kimya", "tyt-biyoloji"], questions: 20 },
];

// Shared by TYT/AYT's own Genel Deneme entry (LGS has its own richer
// net/puan version of this same idea in lib/lgs-exam.ts): Boş is never
// typed, it is what's left of a section's fixed question count once Doğru
// and Yanlış are known.
export function emptyForGroup(questions: number, correct: number | null, wrong: number | null): number | null {
  if (correct === null || wrong === null) return null;
  return Math.max(0, questions - correct - wrong);
}

// Doğru + Yanlış above a section's fixed question count -- the form refuses
// to save (mirrors lgsOverCapSubject in components/lgs-exam-score-grid.tsx).
export function overCapGroup<T extends { key: string; questions: number }>(
  groups: T[],
  inputs: Record<string, { correct: string; wrong: string }>,
): T | undefined {
  return groups.find((g) => {
    const v = inputs[g.key];
    return v ? (Number(v.correct) || 0) + (Number(v.wrong) || 0) > g.questions : false;
  });
}

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

// `questions` is each section's real, fixed AYT question count (80 per
// track), same purpose as TYT_SUBJECT_GROUPS' own field above.
export const AYT_SUBJECT_GROUPS_BY_TRACK: Record<
  Track,
  { key: AytSubjectGroupKey; label: string; courseIds: string[]; questions: number }[]
> = {
  sayisal: [
    { key: "ayt_matematik", label: "Matematik", courseIds: ["ayt-matematik-sayisal", "ayt-geometri-sayisal"], questions: 40 },
    { key: "ayt_fizik", label: "Fizik", courseIds: ["ayt-fizik"], questions: 14 },
    { key: "ayt_kimya", label: "Kimya", courseIds: ["ayt-kimya"], questions: 13 },
    { key: "ayt_biyoloji", label: "Biyoloji", courseIds: ["ayt-biyoloji"], questions: 13 },
  ],
  ea: [
    {
      key: "ayt_ea_sozel1",
      label: "Türk Dili ve Edebiyatı - Sosyal Bilimler 1",
      courseIds: ["ayt-edebiyat-ea", "ayt-tarih-1-ea", "ayt-cografya-1-ea"],
      questions: 40,
    },
    { key: "ayt_ea_matematik", label: "Matematik", courseIds: ["ayt-matematik-ea", "ayt-geometri-ea"], questions: 40 },
  ],
  sozel: [
    {
      key: "ayt_sozel_sozel1",
      label: "Türk Dili ve Edebiyatı - Sosyal Bilimler 1",
      courseIds: ["ayt-edebiyat-sozel", "ayt-tarih-1-sozel", "ayt-cografya-1-sozel"],
      questions: 40,
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
      questions: 40,
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

// 9th-grade (Maarif) Genel Deneme: 120 questions, scored per subject like
// LGS. Keys are `m9_`-prefixed for the same reason LGS's are `lgs_`-prefixed:
// they must never collide with TYT's unprefixed keys in subject_scores.
// `courseIds` point at the "9. Sınıf Genel Deneme Analizi" sheet's own
// subject list (MAARIF9_GENEL_DENEME_COURSES) used for topic analysis.
export const MAARIF9_EXAM_SUBJECTS: { key: string; label: string; section: string; courseIds: string[]; questions: number }[] = [
  { key: "m9_turkce", label: "Türk Dili ve Edebiyatı", section: "TÜRKÇE", courseIds: ["maarif9-gd-turk-dili-ve-edebiyati"], questions: 30 },
  { key: "m9_tarih", label: "Tarih", section: "SOSYAL BİLİMLER", courseIds: ["maarif9-gd-tarih"], questions: 10 },
  { key: "m9_cografya", label: "Coğrafya", section: "SOSYAL BİLİMLER", courseIds: ["maarif9-gd-cografya"], questions: 10 },
  { key: "m9_din", label: "Din Kültürü", section: "SOSYAL BİLİMLER", courseIds: ["maarif9-gd-din-kulturu"], questions: 10 },
  { key: "m9_matematik", label: "Matematik", section: "MATEMATİK", courseIds: ["maarif9-gd-matematik"], questions: 30 },
  { key: "m9_fizik", label: "Fizik", section: "FEN BİLİMLERİ", courseIds: ["maarif9-gd-fizik"], questions: 10 },
  { key: "m9_kimya", label: "Kimya", section: "FEN BİLİMLERİ", courseIds: ["maarif9-gd-kimya"], questions: 10 },
  { key: "m9_biyoloji", label: "Biyoloji", section: "FEN BİLİMLERİ", courseIds: ["maarif9-gd-biyoloji"], questions: 10 },
];

export const MAARIF9_EXAM_QUESTION_TOTAL = MAARIF9_EXAM_SUBJECTS.reduce((sum, s) => sum + s.questions, 0); // 120

export function coursesForMaarif9ExamSubject(key: string): Course[] {
  const subject = MAARIF9_EXAM_SUBJECTS.find((s) => s.key === key);
  if (!subject) return [];
  return subject.courseIds.map((id) => MAARIF9_GENEL_DENEME_COURSES.find((c) => c.id === id)).filter((c): c is Course => !!c);
}
