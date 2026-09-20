import { getStudentExamType } from "@/lib/student-exam-type";
import { CikmisSorularClient } from "./cikmis-sorular-client";

export default async function CikmisSorularPage() {
  const examType = await getStudentExamType();
  return <CikmisSorularClient examType={examType} />;
}
