// A topic can carry a Yanlış mark AND a Boş mark in the same exam -- a topic
// often has several questions, and one can be answered wrong while another is
// left blank. So the two are independent flags: the stored shape is one entry
// per (topic, status), and a topic with both simply has two entries
// (student_task_topic_mistakes is unique per task + course + topic + status,
// migration 0116). Toggling one flag never touches the other.
//
// Shared by the student's and the coach's mistake pickers.
export type MistakeStatus = "wrong" | "blank";
export type MistakeEntry = { course_id: string; topic_id: string; status: MistakeStatus };

export function hasMistake(selected: MistakeEntry[], courseId: string, topicId: string, status: MistakeStatus): boolean {
  return selected.some((m) => m.course_id === courseId && m.topic_id === topicId && m.status === status);
}

// Adds the (topic, status) mark if it is not set, removes it if it is --
// other statuses on the same topic are left exactly as they were.
export function toggleMistake(selected: MistakeEntry[], courseId: string, topicId: string, status: MistakeStatus): MistakeEntry[] {
  if (hasMistake(selected, courseId, topicId, status)) {
    return selected.filter((m) => !(m.course_id === courseId && m.topic_id === topicId && m.status === status));
  }
  return [...selected, { course_id: courseId, topic_id: topicId, status }];
}

// A bucket (lib/curriculum/maarif-tyt-structure.ts) is ONE tickable row that
// hides several real topics. Ticking it marks its first topic (the id a row is
// always saved against); it reads as marked when ANY of its topics is (so marks
// made on another member earlier still show), and un-ticking clears the status
// from every member -- otherwise a stray mark could never be removed.
export function hasMistakeInGroup(selected: MistakeEntry[], courseId: string, topicIds: string[], status: MistakeStatus): boolean {
  return topicIds.some((id) => hasMistake(selected, courseId, id, status));
}

export function toggleMistakeInGroup(selected: MistakeEntry[], courseId: string, topicIds: string[], status: MistakeStatus): MistakeEntry[] {
  if (hasMistakeInGroup(selected, courseId, topicIds, status)) {
    const ids = new Set(topicIds);
    return selected.filter((m) => !(m.course_id === courseId && m.status === status && ids.has(m.topic_id)));
  }
  return [...selected, { course_id: courseId, topic_id: topicIds[0], status }];
}
