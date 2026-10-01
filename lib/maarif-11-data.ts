// 11. Sınıf Türkiye Yüzyılı Maarif Modeli -- a dedicated curriculum browser
// for this grade's own subject/unit/sub-topic structure. This is NOT the
// existing Maarif9/10 task-assignment pipeline (lib/curriculum/maarif9.ts,
// maarif10.ts), which feeds the generic Kaynak Takibi resource tracker and
// coach task-kanban/exam pickers -- there is no equivalent "11th grade"
// cohort flag anywhere yet (profiles has is_maarif9/is_maarif10 only, see
// migrations 0096/0099), and this feature has no quiz/task mechanic defined
// yet either. It's purely a reference browser the student can check topics
// off in, built on the LGS vocab quiz's own page+dashboard+progress-bar
// pattern (app/student/ingilizce-quiz/) per that explicit design brief.
//
// MAARIF11_SUBJECTS is an empty placeholder -- the real curriculum content
// (subjects, each one's units, each unit's sub-topics) is pasted in
// separately once it's ready. Keep each id stable and unique once real data
// lands (e.g. "{subject}-{unit}-{n}"): a future per-student progress table
// would key off it.

export type Maarif11SubTopic = {
  id: string;
  name: string;
  // Whether the student has marked this sub-topic as studied. Always
  // false/undefined in the placeholder data below -- no save/toggle action
  // exists yet (no DB table, no server action), so this is purely what the
  // dashboard's progress bar will read once that interaction is built. Not
  // wired to anything persistent yet.
  completed?: boolean;
};

export type Maarif11Unit = {
  id: string;
  name: string;
  subTopics: Maarif11SubTopic[];
};

export type Maarif11Subject = {
  id: string;
  name: string;
  units: Maarif11Unit[];
};

// Placeholder -- paste the real 11th-grade curriculum here, grouped by subject.
export const MAARIF11_SUBJECTS: Maarif11Subject[] = [];

export type Maarif11SubjectStat = { subjectId: string; completed: number; total: number };

// Pure aggregation behind the dashboard's per-subject progress bar -- counts
// every sub-topic across every unit of a subject, same "completed/total"
// shape as the LGS vocab quiz's own UnitStat (lib/lgs-vocab.ts).
export function computeMaarif11SubjectStats(subjects: Maarif11Subject[]): Maarif11SubjectStat[] {
  return subjects.map((subject) => {
    const subTopics = subject.units.flatMap((unit) => unit.subTopics);
    return {
      subjectId: subject.id,
      completed: subTopics.filter((t) => t.completed).length,
      total: subTopics.length,
    };
  });
}
