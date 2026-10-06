"use client";

import { Label } from "@/components/ui/label";
import type { Course } from "@/lib/curriculum";
import { PROBLEMLER_COURSE_ID, PROBLEMLER_MASTER_ID, problemlerMainValue, problemlerSubtopics } from "@/lib/curriculum/problemler";

// The second step of the TYT Matematik "Problemler" choice (the coach's "Yeni görev ekle" and the student's "Ek Çalışma
// Ekle"): once the Konu picker is on "Problemler (Genel)" -- or on one of its subtopics, which the main list does not
// show on its own -- this optional picker lets the task stay general or name a specific problem type. Renders nothing
// for any other course or topic.
export function ProblemlerSubtopicSelect({ course, topicId, onChange }: { course: Course; topicId: string; onChange: (topicId: string) => void }) {
  if (course.id !== PROBLEMLER_COURSE_ID || problemlerMainValue(course, topicId) !== PROBLEMLER_MASTER_ID) return null;
  return (
    <div className="space-y-1.5 sm:col-start-2">
      <Label htmlFor="problemler-subtopic">Problem türü (opsiyonel)</Label>
      <select
        id="problemler-subtopic"
        value={topicId === PROBLEMLER_MASTER_ID ? "" : topicId}
        onChange={(e) => onChange(e.target.value || PROBLEMLER_MASTER_ID)}
        className="border-input bg-background flex h-10 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none md:h-9"
        aria-label="Problem türü seç"
      >
        <option value="">Genel (tüm problemler)</option>
        {problemlerSubtopics(course).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
