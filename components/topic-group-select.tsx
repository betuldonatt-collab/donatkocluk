"use client";

import { Label } from "@/components/ui/label";
import type { Course } from "@/lib/curriculum";
import { groupOfTopic, mainValueOf } from "@/lib/curriculum/topic-groups";
import { PROBLEMLER_COURSE_ID, PROBLEMLER_UNIT_LABEL } from "@/lib/curriculum/problemler";

// The second step of the two-step topic choice (the coach's "Yeni görev ekle" and the student's "Ek Çalışma Ekle"):
// once the Konu picker is on a master topic ("Trigonometri (Genel)", "Dalgalar (Genel)", "Problemler (Genel)" ...) -- or
// on one of its subtopics, which the main list does not show on its own -- this optional picker lets the task stay
// general or name a specific subtopic. Renders nothing for a flat topic or a course without grouped units.
export function TopicGroupSelect({ course, topicId, onChange }: { course: Course; topicId: string; onChange: (topicId: string) => void }) {
  const group = groupOfTopic(course, topicId);
  if (!group || mainValueOf(course, topicId) !== group.masterId) return null;
  const isProblemler = course.id === PROBLEMLER_COURSE_ID && group.unitLabel === PROBLEMLER_UNIT_LABEL;
  return (
    <div className="space-y-1.5 sm:col-start-2">
      <Label htmlFor="topic-group-subtopic">{isProblemler ? "Problem türü (opsiyonel)" : "Alt konu (opsiyonel)"}</Label>
      <select
        id="topic-group-subtopic"
        value={topicId === group.masterId ? "" : topicId}
        onChange={(e) => onChange(e.target.value || group.masterId)}
        className="border-input bg-background flex h-10 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none md:h-9"
        aria-label={isProblemler ? "Problem türü seç" : "Alt konu seç"}
      >
        <option value="">{isProblemler ? "Genel (tüm problemler)" : "Genel"}</option>
        {group.members.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
