import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";

type CoachNoteType = "main_session" | "check_in" | "parent_meeting";

// Parent-facing labels are deliberately friendlier than the coach-side
// jargon ("Ana Görüşme" / "Ara Görüşme") -- DB values are untouched.
const NOTE_TYPE_LABELS: Record<CoachNoteType, string> = {
  main_session: "Haftalık Değerlendirme",
  check_in: "Ara Bilgilendirme",
  parent_meeting: "Veli Görüşmesi",
};
const NOTE_TYPE_COLORS: Record<CoachNoteType, string> = {
  main_session: "bg-emerald-500/15 text-emerald-700",
  check_in: "bg-amber-500/15 text-amber-700",
  parent_meeting: "bg-blue-500/15 text-blue-700",
};

// Date only, deliberately no hour/minute -- parents shouldn't see the
// exact time a note was written, only the day.
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function fetchApprovedNotes() {
  const studentId = await getActiveStudentId();
  if (!studentId) return [];

  const supabase = await createClient();
  // RLS (coach_notes_parent_read) already restricts this to
  // parent_share_status = 'approved' -- repeated here defensively, not as
  // the actual security boundary.
  const { data } = await supabase
    .from("coach_notes")
    .select("id, type, content, created_at")
    .eq("student_id", studentId)
    .eq("parent_share_status", "approved")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function ParentNotesPage() {
  const notes = await fetchApprovedNotes();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Koçtan Notlar</h1>
        <p className="text-muted-foreground mt-1 text-sm">Koçun paylaştığı görüşme notları.</p>
      </header>

      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz paylaşılan bir not yok.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="border-border rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${NOTE_TYPE_COLORS[note.type as CoachNoteType]}`}>
                  {NOTE_TYPE_LABELS[note.type as CoachNoteType]}
                </span>
                <span className="text-muted-foreground text-xs">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-foreground text-sm whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
