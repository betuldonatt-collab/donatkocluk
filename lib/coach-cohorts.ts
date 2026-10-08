// Which groups (cohorts) a coach actually manages, so the coach dashboard only shows the panels of those groups. With several coaches,
// a coach who only has Lise and LGS students must not see a "7. Sınıf" window at all.
//
// The three groups the dashboard has panels for, using the same split those panels already apply to their tasks:
//   - lgs:     exam_type = 'LGS'
//   - maarif7: not LGS, and a 7th grader (profiles.is_maarif7)
//   - yks:     everyone else -- YKS, mezun, and the 9th / 10th / 11th grades (they share the "YKS" panel)
// Only ACTIVE students count (profiles.is_active is not false): a deactivated student does not keep a group's panel on screen.
export type CoachCohorts = { yks: boolean; lgs: boolean; maarif7: boolean };

export const NO_COHORTS: CoachCohorts = { yks: false, lgs: false, maarif7: false };

export function coachCohorts(
  students: { id: string; exam_type?: "YKS" | "LGS" | null; is_active?: boolean | null }[],
  gradeById: Map<string, number | null>,
): CoachCohorts {
  const cohorts: CoachCohorts = { yks: false, lgs: false, maarif7: false };
  for (const s of students) {
    if (s.is_active === false) continue;
    if (s.exam_type === "LGS") cohorts.lgs = true;
    else if (gradeById.get(s.id) === 7) cohorts.maarif7 = true;
    else cohorts.yks = true;
  }
  return cohorts;
}

// The coach's groups from one embedded read of their roster (coach_students -> profiles), for the sidebar's exam countdowns.
// null when the roster could not be read (e.g. a column missing) -- the caller then shows everything, as before.
export function coachCohortsFromRoster(
  links:
    | { student_id: string; profiles: { exam_type?: "YKS" | "LGS" | null; is_active?: boolean | null; is_maarif7?: boolean | null } | { exam_type?: "YKS" | "LGS" | null; is_active?: boolean | null; is_maarif7?: boolean | null }[] | null }[]
    | null,
): CoachCohorts | null {
  if (!links) return null;
  const students: { id: string; exam_type?: "YKS" | "LGS" | null; is_active?: boolean | null }[] = [];
  const grades = new Map<string, number | null>();
  for (const link of links) {
    const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles;
    if (!profile) continue;
    students.push({ id: link.student_id, exam_type: profile.exam_type, is_active: profile.is_active });
    if (profile.is_maarif7 === true) grades.set(link.student_id, 7);
  }
  return coachCohorts(students, grades);
}

// A group's panel is shown when the coach has active students in it -- or when it already holds something to act on (a pending
// approval left by a student who has since been deactivated must never disappear from sight).
export function showCohortPanel(hasActiveStudents: boolean, itemCount: number): boolean {
  return hasActiveStudents || itemCount > 0;
}
