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
