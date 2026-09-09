"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncement, deleteAnnouncement, toggleAnnouncementActive } from "./actions";

type Announcement = {
  id: string;
  title: string;
  content: string;
  expiry_date: string | null;
  event_date: string | null;
  event_time: string | null;
  requires_rsvp: boolean;
  is_active: boolean;
};

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function AnnouncementsAdmin({ announcements }: { announcements: Announcement[] }) {
  const [items, setItems] = useState(announcements);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [requiresRsvp, setRequiresRsvp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await createAnnouncement({
        title: title.trim(),
        content: content.trim(),
        expiryDate: expiryDate || null,
        eventDate: eventDate || null,
        eventTime: eventDate ? eventTime || null : null,
        requiresRsvp,
      });
      setItems((prev) => [
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          content: content.trim(),
          expiry_date: expiryDate || null,
          event_date: eventDate || null,
          event_time: eventDate ? eventTime || null : null,
          requires_rsvp: requiresRsvp,
          is_active: true,
        },
        ...prev,
      ]);
      setTitle("");
      setContent("");
      setExpiryDate("");
      setEventDate("");
      setEventTime("");
      setRequiresRsvp(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setTogglingId(id);
    try {
      await toggleAnnouncementActive(id, isActive);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: isActive } : a)));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteAnnouncement(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-border space-y-2 rounded-lg border p-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" />
        <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="İçerik" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="announcement-expiry" className="text-muted-foreground text-xs font-normal">
              Son geçerlilik (opsiyonel)
            </Label>
            <Input
              id="announcement-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="announcement-event-date" className="text-muted-foreground text-xs font-normal">
              Etkinlik tarihi (opsiyonel)
            </Label>
            <Input
              id="announcement-event-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="announcement-event-time" className="text-muted-foreground text-xs font-normal">
              Etkinlik saati (opsiyonel)
            </Label>
            <Input
              id="announcement-event-time"
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              disabled={!eventDate}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox id="announcement-rsvp" checked={requiresRsvp} onCheckedChange={(v) => setRequiresRsvp(v === true)} />
            <Label htmlFor="announcement-rsvp" className="text-sm font-normal">
              Katılım onayı gerekli (öğrenciler)
            </Label>
          </div>
          <Button type="button" size="sm" onClick={handleCreate} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? "Ekleniyor..." : "Duyuru Ekle"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz duyuru yok.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="border-border flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-foreground text-sm font-medium">{a.title}</p>
                  {a.requires_rsvp && (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-600">
                      Katılım Onayı
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-wrap">{a.content}</p>
                {a.event_date && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Etkinlik tarihi: {formatDate(a.event_date)}
                    {a.event_time && ` — ${a.event_time.slice(0, 5)}`}
                  </p>
                )}
                {a.expiry_date && (
                  <p className="text-muted-foreground mt-1 text-xs">Son geçerlilik: {formatDate(a.expiry_date)}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(a.id, !a.is_active)}
                  disabled={togglingId === a.id}
                  className="text-primary text-xs font-medium underline disabled:opacity-50"
                >
                  {a.is_active ? "Pasifleştir" : "Aktifleştir"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  className="text-destructive text-xs font-medium underline disabled:opacity-50"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
