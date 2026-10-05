import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";

import { fetchIsGraduate } from "@/lib/graduate";
import { getViewContext } from "@/lib/impersonation";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { COHORT_LABELS, DEFAULT_SCHOOL_COURSES, schoolCohortOf, type RemovalStatus } from "@/lib/school-exams";
import { createClient } from "@/lib/supabase/server";
import { YazililarClient, type StoredCourse, type StoredGrade } from "./yazililar-client";

// Yazılılar -- the school-exam tracker: a coloured card per course with the grades of
// each term's two yazılılar. The courses a student starts with follow their school
// grade (lib/school-exams.ts); they can add their own and recolour any card.
export default async function YazililarPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();

  let profileExamType: "YKS" | "LGS" = "YKS";
  let maarifGrade: 7 | 9 | 10 | 11 | null = null;
  let isGraduate = false;
  if (view) {
    const { data: profile } = await supabase.from("profiles").select("exam_type").eq("id", view.effectiveUserId).maybeSingle();
    profileExamType = profile?.exam_type === "LGS" ? "LGS" : "YKS";
    maarifGrade = await fetchMaarifGrade(supabase, view.effectiveUserId);
    isGraduate = await fetchIsGraduate(supabase, view.effectiveUserId);
  }
  const cohort = view ? schoolCohortOf({ examType: profileExamType, maarifGrade, isGraduate }) : null;
  // Graduates (Mezun) take no school exams: the menu item is hidden for them, and the
  // page is closed too, so typing the address does not get them in.
  if (view && !cohort) redirect("/student");

  let courses: StoredCourse[] = [];
  let grades: StoredGrade[] = [];
  let ready = true;
  if (view && cohort) {
    const [courseRes, gradeRes] = await Promise.all([
      supabase
        .from("student_school_courses")
        .select("id, course_key, is_custom, name, color, sort_order, removal_status, removed_at")
        .eq("student_id", view.effectiveUserId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("student_school_grades").select("course_id, term, exam_no, grade").eq("student_id", view.effectiveUserId),
    ]);
    if (courseRes.error || gradeRes.error) {
      // Most likely migration 0118 is not applied yet -- say so calmly instead of crashing.
      ready = false;
      console.error("[YazililarPage] read failed:", courseRes.error ?? gradeRes.error);
    } else {
      courses = (courseRes.data ?? []).map((c) => ({
        id: c.id as string,
        key: c.course_key as string,
        isCustom: c.is_custom as boolean,
        name: c.name as string,
        color: (c.color as string | null) ?? null,
        removalStatus: c.removal_status as RemovalStatus,
        removed: c.removed_at !== null,
      }));
      grades = (gradeRes.data ?? []).map((g) => ({
        courseId: g.course_id as string,
        term: g.term as 1 | 2,
        examNo: g.exam_no as 1 | 2,
        grade: Number(g.grade),
      }));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center gap-3">
        <NotebookPen className="text-muted-foreground size-6" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">Yazılılar</h1>
          <p className="text-muted-foreground text-sm">
            {cohort ? `${COHORT_LABELS[cohort]} yazılı notların. ` : ""}Her dersin kartına her dönemin yazılı notlarını gir.
          </p>
        </div>
      </header>

      {!ready || !cohort ? (
        <p className="text-muted-foreground text-sm">Bu bölüm çok yakında burada olacak.</p>
      ) : (
        <YazililarClient
          defaults={DEFAULT_SCHOOL_COURSES[cohort]}
          courses={courses}
          grades={grades}
          readOnly={view?.isImpersonating ?? false}
        />
      )}
    </div>
  );
}
