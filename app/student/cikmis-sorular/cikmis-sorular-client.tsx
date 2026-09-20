"use client";

import { CourseTabs } from "@/components/course-tabs";
import type { ExamType } from "@/lib/exam-type";
import { PastQuestionsTable } from "./_components/past-questions-table";

export function CikmisSorularClient({ examType }: { examType: ExamType }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Çıkmış Sorular</h1>
        <p className="text-muted-foreground text-sm">
          Konuların yıllara göre soru ağırlığı — hangi konudan hangi yıl kaç
          soru çıktığını gösteren referans tablo.
        </p>
      </header>

      <CourseTabs examType={examType} render={(course) => <PastQuestionsTable course={course} />} />
    </div>
  );
}
