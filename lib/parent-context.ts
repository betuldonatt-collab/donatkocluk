"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { parseInput, uuidSchema } from "@/lib/validation";

const COOKIE_NAME = "parent_active_student";

export type LinkedStudent = { id: string; full_name: string | null };

// Every linked child, name-sorted. Most parents have exactly one -- the
// switcher UI (student-switcher.tsx) only renders when this has more than
// one entry, per the explicit "hide it for a single child" requirement.
export async function getLinkedStudents(): Promise<LinkedStudent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: links } = await supabase.from("parent_students").select("student_id").eq("parent_id", user.id);
  const ids = (links ?? []).map((l) => l.student_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .order("full_name", { ascending: true });
  return (profiles ?? []) as LinkedStudent[];
}

// The student every parent page should read/act on. A single-child parent
// never touches the cookie at all -- their one child is always the
// answer. A multi-child parent's choice persists across visits via the
// cookie; an invalid/stale cookie value (e.g. a since-unlinked student)
// silently falls back to the first child rather than erroring.
export async function getActiveStudentId(): Promise<string | null> {
  const students = await getLinkedStudents();
  if (students.length === 0) return null;
  if (students.length === 1) return students[0].id;

  const store = await cookies();
  const cookieValue = store.get(COOKIE_NAME)?.value;
  if (cookieValue && students.some((s) => s.id === cookieValue)) return cookieValue;
  return students[0].id;
}

// Called from the client-side switcher. Re-validates against the parent's
// own links (not trusted from the client) before persisting.
export async function setActiveStudent(studentId: string) {
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
}
