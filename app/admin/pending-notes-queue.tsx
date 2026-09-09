"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveCoachNote, rejectCoachNote, requestCoachNoteRevision } from "./actions";

type Person = { id: string; full_name: string | null };

type PendingNote = {
  id: string;
  type: "main_session" | "check_in";
  content: string;
  student: Person;
  coach: Person;
};

const NOTE_TYPE_LABELS: Record<PendingNote["type"], string> = {
  main_session: "Ana Görüşme",
  check_in: "Ara Görüşme",
};

function RevisionAction({ noteId, onDone }: { noteId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await requestCoachNoteRevision(noteId, note.trim());
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Revizyon İste
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Revizyon notu (zorunlu)..."
        className="min-w-[200px] flex-1"
      />
      <Button type="button" size="sm" onClick={handleSubmit} disabled={saving || !note.trim()}>
        {saving ? "Gönderiliyor..." : "Gönder"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        İptal
      </Button>
    </div>
  );
}

export function PendingNotesQueue({ notes }: { notes: PendingNote[] }) {
  const [items, setItems] = useState(notes);

  function removeItem(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleApprove(id: string) {
    await approveCoachNote(id);
    removeItem(id);
  }

  async function handleReject(id: string) {
    await rejectCoachNote(id);
    removeItem(id);
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Onay bekleyen not yok.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((note) => (
        <div key={note.id} className="border-border rounded-lg border p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-secondary rounded px-1.5 py-0.5 font-medium">{NOTE_TYPE_LABELS[note.type]}</span>
            <span className="text-muted-foreground">
              {note.student.full_name ?? "İsimsiz Öğrenci"} — Koç: {note.coach.full_name ?? "İsimsiz Koç"}
            </span>
          </div>
          <p className="text-foreground mb-3 text-sm whitespace-pre-wrap">{note.content || "Not bırakılmadı."}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => handleApprove(note.id)}>
              Onayla
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => handleReject(note.id)}>
              Reddet
            </Button>
            <RevisionAction noteId={note.id} onDone={() => removeItem(note.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}
