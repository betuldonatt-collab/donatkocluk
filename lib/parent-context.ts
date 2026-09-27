"use server";

import { cache } from "react";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { logPerf, startPerf } from "@/lib/perf-log";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";
import { parseInput, uuidSchema } from "@/lib/validation";

const COOKIE_NAME = "parent_active_student";

// Everything the parent home needs about the student's own profile rides along with
// the linked-students lookup, so the page does not read profiles again.
export type LinkedStudent = {
  id: string;
  full_name: string | null;
  exam_type: string | null;
  is_active: boolean | null;
  total_session_quota: number;
  quota_cycle_start_at: string;
};

// Every linked child, name-sorted. Most parents have exactly one -- the
// switcher UI (student-switcher.tsx) only renders when this has more than
// one entry, per the explicit "hide it for a single child" requirement.
//
// Wrapped in React's cache(): ParentLayout, every parent page (page.tsx,
// settings/page.tsx, notes/page.tsx, karne/...) AND getActiveStudentId
// below all call this independently, with no way for a layout to hand its
// own already-fetched result down to a sibling page in the RSC tree --
// without this, a single page load (and every router.refresh(), which is
// exactly what the switcher triggers) re-ran this same parent_students +
// profiles round trip 3-4 times over. cache() dedupes repeat calls with
// the same arguments to one real fetch per request, so every one of those
// call sites still reads naturally as "just fetch the list" while only
// the first call actually hits the database.
export const getLinkedStudents = cache(async (): Promise<LinkedStudent[]> => {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  // ONE query (parent_students joined to the student's profile) instead of two
  // sequential ones; the profile is readable to a linked parent through
  // profiles_select_by_parent (0026).
  const { data: links } = await supabase
    .from("parent_students")
    .select("profiles!student_id(id, full_name, exam_type, is_active, total_session_quota, quota_cycle_start_at)")
    .eq("parent_id", user.id);

  const students: LinkedStudent[] = [];
  for (const link of (links ?? []) as unknown as { profiles: LinkedStudent | LinkedStudent[] | null }[]) {
    const p = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles;
    if (p) students.push(p);
  }
  return students.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "tr"));
});

// The student every parent page should read/act on. A single-child parent
// never touches the cookie at all -- their one child is always the
// answer. A multi-child parent's choice persists across visits via the
// cookie; an invalid/stale cookie value (e.g. a since-unlinked student)
// silently falls back to the first child rather than erroring. Also
// cache()d, same reasoning as getLinkedStudents above -- and since it
// calls that same cached function internally, calling both in one request
// (ParentLayout does) still only costs one real fetch total, not two.
export const getActiveStudentId = cache(async (): Promise<string | null> => {
  const students = await getLinkedStudents();
  if (students.length === 0) return null;
  if (students.length === 1) return students[0].id;

  const store = await cookies();
  const cookieValue = store.get(COOKIE_NAME)?.value;
  if (cookieValue && students.some((s) => s.id === cookieValue)) return cookieValue;
  return students[0].id;
});

// Called from the client-side switcher. Re-validates against the parent's
// own links (not trusted from the client) before persisting.
export async function setActiveStudent(studentId: string) {
  const perfStart = startPerf();
  const studentIdV = parseInput(uuidSchema, studentId);
  const students = await getLinkedStudents();
  if (!students.some((s) => s.id === studentIdV)) {
    throw new Error("Bu öğrenci hesabınıza bağlı değil.");
  }

  const store = await cookies();
  store.set(COOKIE_NAME, studentIdV, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Re-render the parent tree in THIS action's own response: the switcher used to
  // call the action and then router.refresh() -- two sequential round trips, the
  // second one doing the whole server render. Now it is one.
  revalidatePath("/parent", "layout");
  logPerf("setActiveStudent action", perfStart);
}
