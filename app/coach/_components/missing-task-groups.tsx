import { findCourseById } from "@/lib/curriculum";
import { groupMissingByDate, type MissingTaskReason } from "@/lib/missing-tasks";

// One missing task, reduced to what the list shows -- shared by the student
// detail card and the dashboard's LGS summary dialog.
export type MissingTaskRow = { id: string; task_date: string; title: string; course_id: string | null; reason: MissingTaskReason };

const REASON_LABEL: Record<MissingTaskReason, string> = {
  no_photo: "Kanıt fotoğrafı yok",
  photo_rejected: "Fotoğraf reddedildi",
  not_done: "Yapılmadı",
  incomplete: "Tamamlanmadı",
};

const REASON_STYLE: Record<MissingTaskReason, string> = {
  no_photo: "bg-rose-500/10 text-rose-700",
  photo_rejected: "bg-rose-500/10 text-rose-700",
  not_done: "bg-amber-500/10 text-amber-700",
  incomplete: "bg-amber-500/10 text-amber-700",
};

export function formatMissingDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

// Tasks boxed by day: the date is a header, that day's tasks sit under it.
export function MissingTaskDateGroups({ groups }: { groups: ReturnType<typeof groupMissingByDate<MissingTaskRow>> }) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.date} className="overflow-hidden rounded-lg border">
          <h4 className="bg-muted/40 flex items-center justify-between px-3 py-1.5 text-xs font-semibold">
            <span>{formatMissingDay(group.date)}</span>
            <span className="text-muted-foreground font-normal">{group.items.length} görev</span>
          </h4>
          <ul className="divide-y">
            {group.items.map((item) => {
              const course = findCourseById(item.course_id);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {course && <p className="text-muted-foreground text-xs">{course.name}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${REASON_STYLE[item.reason]}`}>
                    {REASON_LABEL[item.reason]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
