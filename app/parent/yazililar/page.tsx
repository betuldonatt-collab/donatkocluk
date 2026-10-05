import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";

import { getActiveStudentId, getLinkedStudents } from "@/lib/parent-context";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { fetchSchoolExams } from "@/lib/school-exams-data";
import { createClient } from "@/lib/supabase/server";
import { ParentSchoolExams } from "../_components/parent-school-exams";

// Yazılılar for a parent: a read-only view of the linked student's school-exam grades. The student (and the
// coach) enter them; a parent only looks. A graduate (Mezun) has no school exams.
export default async function ParentYazililarPage() {
  const studentId = await getActiveStudentId();
  if (!studentId) redirect("/parent");

  const student = (await getLinkedStudents()).find((s) => s.id === studentId);
  if (!student) redirect("/parent");

  const supabase = await createClient();
  const maarifGrade = await fetchMaarifGrade(supabase, studentId);
  // Best-effort and never throws (null for a graduate; ready=false if the tables are unreadable).
  const data = await fetchSchoolExams(supabase, studentId, { examType: student.exam_type === "LGS" ? "LGS" : "YKS", maarifGrade });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex items-center gap-3">
        <NotebookPen className="text-muted-foreground size-6" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">Yazılılar</h1>
          <p className="text-muted-foreground text-sm">{student.full_name ?? "Öğrenci"} -- salt okunur</p>
        </div>
      </header>

      {data ? (
        <ParentSchoolExams data={data} />
      ) : (
        <p className="text-muted-foreground text-sm">Mezun öğrencilerin okul yazılı notları bulunmuyor.</p>
      )}
    </div>
  );
}
