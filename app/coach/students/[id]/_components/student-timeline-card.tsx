"use client";

import { useState } from "react";
import { MessageSquareText, Plus, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MISSED_REASON_LABELS } from "../../../dashboard/types";
import { createCoachNote, getMoreStudentNotes, resubmitCoachNote } from "../../../actions";
import { STUDENT_NOTES_PAGE_SIZE } from "../constants";
import type { CoachNoteType, DetailCoachNote, DetailSession, ParentShareStatus } from "../types";

const NOTE_TYPE_LABELS: Record<CoachNoteType, string> = {
  main_session: "Ana Görüşme",
  check_in: "Ara Görüşme",
  parent_meeting: "Veli Görüşmesi",
};

const NOTE_TYPE_BADGE_CLASSES: Record<CoachNoteType, string> = {
  main_session: "bg-emerald-500/15 text-emerald-700",
  check_in: "bg-amber-500/15 text-amber-700",
  parent_meeting: "bg-blue-500/15 text-blue-700",
};

const SHARE_STATUS_LABELS: Partial<Record<ParentShareStatus, string>> = {
  pending: "Onay Bekliyor",
  approved: "Veli ile Paylaşıldı",
  rejected: "Reddedildi",
  revision_requested: "Revizyon Gerekli",
};

const SHARE_STATUS_BADGE_CLASSES: Partial<Record<ParentShareStatus, string>> = {
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-700",
  rejected: "bg-slate-500/15 text-slate-700",
  revision_requested: "bg-rose-500/15 text-rose-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function selectClassName() {
  return "border-input bg-background flex h-10 md:h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

function AddNoteDialog({
  studentId,
  open,
  onOpenChange,
  onSaved,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (note: DetailCoachNote) => void;
}) {
  const [type, setType] = useState<CoachNoteType>("main_session");
  const [guardianDescriptor, setGuardianDescriptor] = useState("");
  const [content, setContent] = useState("");
  const [shareWithParent, setShareWithParent] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType("main_session");
    setGuardianDescriptor("");
    setContent("");
    setShareWithParent(false);
  }

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const note = await createCoachNote({
        studentId,
        type,
        content: content.trim(),
        guardianDescriptor: type === "parent_meeting" ? guardianDescriptor.trim() || null : null,
        shareWithParent,
      });
      onSaved(note as DetailCoachNote);
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Not Ekle</DialogTitle>
          <DialogDescription>Görüşme türünü seç ve notunu yaz.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="note-type">Görüşme Türü</Label>
            <select
              id="note-type"
              value={type}
              onChange={(e) => setType(e.target.value as CoachNoteType)}
              className={selectClassName()}
            >
              {(Object.keys(NOTE_TYPE_LABELS) as CoachNoteType[]).map((key) => (
                <option key={key} value={key}>
                  {NOTE_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {type === "parent_meeting" && (
            <div className="space-y-1.5">
              <Label htmlFor="note-guardian">Görüşülen Kişi (opsiyonel)</Label>
              <Input
                id="note-guardian"
                value={guardianDescriptor}
                onChange={(e) => setGuardianDescriptor(e.target.value)}
                placeholder="Örn: Anne - Fatma Hanım"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note-content">Not</Label>
            <Textarea
              id="note-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Görüşme hakkında notunu yaz..."
            />
          </div>

          {type !== "parent_meeting" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="note-share"
                checked={shareWithParent}
                onCheckedChange={(v) => setShareWithParent(v === true)}
              />
              <Label htmlFor="note-share" className="text-sm font-normal">
                Veli Paneli ile Paylaş
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviseNoteForm({ note, onResubmitted }: { note: DetailCoachNote; onResubmitted: (note: DetailCoachNote) => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);

  async function handleResubmit() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const updated = await resubmitCoachNote(note.id, content.trim());
      onResubmitted(updated as DetailCoachNote);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-md bg-rose-500/10 px-3 py-2">
      <div className="flex items-start gap-1.5">
        <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-rose-600" />
        <p className="text-xs text-rose-700">{note.admin_revision_note}</p>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              İptal
            </Button>
            <Button type="button" size="sm" onClick={handleResubmit} disabled={saving || !content.trim()}>
              {saving ? "Gönderiliyor..." : "Yeniden Onaya Gönder"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setEditing(true)}>
          Düzenle ve Yeniden Gönder
        </Button>
      )}
    </div>
  );
}

type TimelineItem =
  | { kind: "note"; date: string; note: DetailCoachNote }
  | { kind: "missed_session"; date: string; session: DetailSession };

export function StudentTimelineCard({
  studentId,
  notes,
  sessions,
  initialHasMore,
}: {
  studentId: string;
  notes: DetailCoachNote[];
  sessions: DetailSession[];
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState(notes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  function handleSaved(note: DetailCoachNote) {
    setItems((prev) => [note, ...prev]);
  }

  function handleResubmitted(updated: DetailCoachNote) {
    setItems((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = (await getMoreStudentNotes(studentId, items.length)) as DetailCoachNote[];
      setItems((prev) => [...prev, ...more]);
      setHasMore(more.length === STUDENT_NOTES_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  const missedSessions = sessions.filter((s) => s.outcome === "not_happened");

  const timeline: TimelineItem[] = [
    ...items.map((note): TimelineItem => ({ kind: "note", date: note.created_at, note })),
    ...missedSessions.map((session): TimelineItem => ({ kind: "missed_session", date: session.scheduled_at, session })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Öğrenci Günlüğü / İletişim Akışı</CardTitle>
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Not Ekle
        </Button>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-muted-foreground text-sm">Henüz kayıt eklenmedi.</p>
        ) : (
          <ol className="space-y-4">
            {timeline.map((item) =>
              item.kind === "note" ? (
                <li key={`note-${item.note.id}`} className="border-border border-b pb-4 last:border-b-0 last:pb-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        NOTE_TYPE_BADGE_CLASSES[item.note.type],
                      )}
                    >
                      {NOTE_TYPE_LABELS[item.note.type]}
                    </span>
                    {item.note.parent_share_status !== "none" && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          SHARE_STATUS_BADGE_CLASSES[item.note.parent_share_status],
                        )}
                      >
                        {SHARE_STATUS_LABELS[item.note.parent_share_status]}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">{formatDate(item.note.created_at)}</span>
                  </div>
                  {item.note.guardian_descriptor && (
                    <p className="text-muted-foreground mb-1 text-xs">Görüşülen: {item.note.guardian_descriptor}</p>
                  )}
                  <p className="text-foreground text-sm whitespace-pre-wrap">
                    {item.note.content || "Not bırakılmadı."}
                  </p>
                  {item.note.parent_share_status === "revision_requested" && (
                    <ReviseNoteForm note={item.note} onResubmitted={handleResubmitted} />
                  )}
                </li>
              ) : (
                <li key={`session-${item.session.id}`} className="border-border border-b pb-4 last:border-b-0 last:pb-0">
                  <p className="text-muted-foreground mb-1 text-xs">{formatDate(item.session.scheduled_at)}</p>
                  <div className="flex items-start gap-1.5">
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-600" />
                    <p className="text-foreground text-sm">
                      Gerçekleşmedi —{" "}
                      {item.session.missed_reason ? MISSED_REASON_LABELS[item.session.missed_reason] : "—"}
                      {item.session.missed_reason_note && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <MessageSquareText className="size-3 shrink-0" />
                          {item.session.missed_reason_note}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ol>
        )}
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
          </Button>
        )}
      </CardContent>

      <AddNoteDialog studentId={studentId} open={dialogOpen} onOpenChange={setDialogOpen} onSaved={handleSaved} />
    </Card>
  );
}
