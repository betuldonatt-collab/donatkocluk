"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import type { Course } from "@/lib/curriculum";
import {
  groupHeadingStructure,
  groupOfTopic,
  HEADING_VALUE_PREFIX,
  mainValueOf,
  pickSecondStep,
  splitTopicHeading,
  type TopicGroup,
} from "@/lib/curriculum/topic-groups";
import { PROBLEMLER_COURSE_ID, PROBLEMLER_UNIT_LABEL } from "@/lib/curriculum/problemler";

const SELECT_CLASS =
  "border-input bg-background flex h-10 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none md:h-9";

// The steps after the Konu picker (the coach's "Yeni görev ekle" and the student's "Ek Çalışma Ekle"). Once the Konu
// picker is on a master topic ("Trigonometri (Genel)", "Dalgalar (Genel)", "1. Ünite: ... (Genel)" ...) -- or on one of its
// subtopics, which the main list does not show on its own -- the optional steps below narrow it:
//   - a group whose subtopics have no heading: ONE step, "Alt konu" (Genel + the subtopics);
//   - a group whose subtopics sit under headings ("Heading › Topic", the Maarif courses): TWO steps, "Başlık" (Genel, each
//     heading, and any subtopic without a heading) and then "Alt başlık" (the topics of the chosen heading).
// Every step is optional: leaving it on "Genel" / unchosen keeps the task at the level above (the unit's master topic).
// Renders nothing for a flat topic or a course without grouped units.
export function TopicGroupSelect({ course, topicId, onChange }: { course: Course; topicId: string; onChange: (topicId: string) => void }) {
  const group = groupOfTopic(course, topicId);
  if (!group || mainValueOf(course, topicId) !== group.masterId) return null;
  const structure = groupHeadingStructure(group);
  if (!structure.hasHeadings) {
    const isProblemler = course.id === PROBLEMLER_COURSE_ID && group.unitLabel === PROBLEMLER_UNIT_LABEL;
    return <FlatSubtopicSelect group={group} topicId={topicId} onChange={onChange} isProblemler={isProblemler} />;
  }
  // keyed by the master: switching to another unit starts the heading step afresh
  return <HeadedSubtopicSelect key={group.masterId} group={group} topicId={topicId} onChange={onChange} />;
}

function FlatSubtopicSelect({ group, topicId, onChange, isProblemler }: { group: TopicGroup; topicId: string; onChange: (id: string) => void; isProblemler: boolean }) {
  return (
    <div className="space-y-1.5 sm:col-start-2">
      <Label htmlFor="topic-group-subtopic">{isProblemler ? "Problem türü (opsiyonel)" : "Alt konu (opsiyonel)"}</Label>
      <select
        id="topic-group-subtopic"
        value={topicId === group.masterId ? "" : topicId}
        onChange={(e) => onChange(e.target.value || group.masterId)}
        className={SELECT_CLASS}
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

function HeadedSubtopicSelect({ group, topicId, onChange }: { group: TopicGroup; topicId: string; onChange: (id: string) => void }) {
  const { entries } = groupHeadingStructure(group);
  // A heading picked but no Alt başlık chosen yet leaves the stored topic at the unit's master, so that choice lives here.
  const [pickedHeading, setPickedHeading] = useState("");
  const member = group.members.find((t) => t.id === topicId) ?? null;
  const memberHeading = member ? splitTopicHeading(member.name).heading : null;
  const heading = member ? (memberHeading ?? "") : pickedHeading;
  const headingEntry = entries.find((e) => e.kind === "heading" && e.heading === heading);

  // what the second box shows: a heading, a loose subtopic, or "Genel"
  const secondValue = member && memberHeading === null ? member.id : heading ? HEADING_VALUE_PREFIX + heading : "";

  function handleSecond(value: string) {
    const next = pickSecondStep(group, topicId, value);
    setPickedHeading(next.pickedHeading);
    if (next.topicId !== topicId) onChange(next.topicId);
  }

  return (
    <>
      <div className="space-y-1.5 sm:col-start-2">
        <Label htmlFor="topic-group-heading">Başlık (opsiyonel)</Label>
        <select id="topic-group-heading" value={secondValue} onChange={(e) => handleSecond(e.target.value)} className={SELECT_CLASS} aria-label="Başlık seç">
          <option value="">Genel</option>
          {entries.map((e) =>
            e.kind === "heading" ? (
              <option key={HEADING_VALUE_PREFIX + e.heading} value={HEADING_VALUE_PREFIX + e.heading}>
                {e.heading}
              </option>
            ) : (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ),
          )}
        </select>
      </div>
      {headingEntry && headingEntry.kind === "heading" && (
        <div className="space-y-1.5 sm:col-start-2">
          <Label htmlFor="topic-group-subtopic">Alt başlık (opsiyonel)</Label>
          <select
            id="topic-group-subtopic"
            value={member && memberHeading === heading ? member.id : ""}
            onChange={(e) => onChange(e.target.value || group.masterId)}
            className={SELECT_CLASS}
            aria-label="Alt başlık seç"
          >
            <option value="">Alt başlık seçilmedi (ünitenin geneli)</option>
            {headingEntry.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
