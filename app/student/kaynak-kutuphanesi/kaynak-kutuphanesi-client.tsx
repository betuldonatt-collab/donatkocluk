"use client";

import { useState } from "react";
import { Library, Plus, Rows3 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { addResource } from "./actions";
import type { LibraryResource } from "./page";

type BulkAddResponse =
  | { ok: true; data: { id: string; name: string; course_id: string }[] }
  | { ok: false; error: string };

export function KaynakKutuphanesiClient({
  initialResources,
}: {
  initialResources: LibraryResource[];
}) {
  const [resources, setResources] = useState(initialResources);
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  function addToState(rows: LibraryResource[]) {
    setResources((prev) => [...prev, ...rows]);
  }

  const aytCourses = AYT_COURSES_BY_TRACK[track];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Kaynak Kütüphanesi</h1>
        <p className="text-muted-foreground text-sm">
          Kullandığın tüm kaynakları buradan ekle — tek tek ya da toplu. Kaynak
          Takibi sayfasına otomatik yansır.
        </p>
      </header>

      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-4">
          <CourseChips courses={TYT_COURSES} selectedId={tytCourseId} onSelect={setTytCourseId} />
          <CourseLibraryPanel
            courseId={tytCourseId}
            courses={TYT_COURSES}
            resources={resources}
            onAdded={addToState}
          />
        </TabsContent>

        <TabsContent value="ayt" className="space-y-4">
          <div className="inline-flex rounded-lg bg-secondary p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTrackChange(t)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  track === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <CourseChips courses={aytCourses} selectedId={aytCourseId} onSelect={setAytCourseId} />
          <CourseLibraryPanel
            courseId={aytCourseId}
            courses={aytCourses}
            resources={resources}
            onAdded={addToState}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CourseChips({
  courses,
  selectedId,
  onSelect,
}: {
  courses: Course[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

function CourseLibraryPanel({
  courseId,
  courses,
  resources,
  onAdded,
}: {
  courseId: string;
  courses: Course[];
  resources: LibraryResource[];
  onAdded: (rows: LibraryResource[]) => void;
}) {
  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const courseResources = resources.filter((r) => r.courseId === course.id);

  const [singleOpen, setSingleOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [singleName, setSingleName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSingleAdd() {
    const name = singleName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const result = await addResource(course.id, name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onAdded([{ id: result.data.id, name: result.data.name, courseId: result.data.course_id }]);
      setSingleName("");
      setSingleOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkAdd() {
    const lines = bulkText.split("\n");
    setSaving(true);
    try {
      const res = await fetch("/api/kaynak-kutuphanesi/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, names: lines }),
      });

      let result: BulkAddResponse;
      try {
        result = await res.json();
      } catch {
        // The response wasn't JSON at all -- e.g. a platform-level error
        // page instead of this route's own handler running. res.status is
        // still the one piece of real information available here.
        toast.error(`Sunucu beklenmeyen bir yanıt döndürdü (HTTP ${res.status}).`);
        return;
      }

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onAdded(result.data.map((r) => ({ id: r.id, name: r.name, courseId: r.course_id })));
      setBulkText("");
      setBulkOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{course.name}</h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSingleOpen(true)}>
              <Plus className="size-4" />
              Kaynak Ekle
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Rows3 className="size-4" />
              Toplu Ekle
            </Button>
          </div>
        </div>

        {courseResources.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Library className="size-4" />
            Bu ders için henüz kaynak eklenmedi.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {courseResources.map((r) => (
              <li
                key={r.id}
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              >
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynak Ekle</DialogTitle>
            <DialogDescription>{course.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="single-resource-name">Kaynak adı</Label>
            <Input
              id="single-resource-name"
              placeholder="Örn: Acil Yayınları TYT Matematik Soru Bankası"
              value={singleName}
              onChange={(e) => setSingleName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSingleAdd()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSingleOpen(false)}>
              İptal
            </Button>
            <Button type="button" disabled={!singleName.trim() || saving} onClick={handleSingleAdd}>
              {saving ? "Ekleniyor..." : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Toplu Kaynak Ekle</DialogTitle>
            <DialogDescription>
              {course.name} — her satıra bir kaynak adı yaz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-resource-names">Kaynaklar</Label>
            <Textarea
              id="bulk-resource-names"
              rows={6}
              placeholder={"Acil Yayınları Soru Bankası\n345 Yayınları Konu Anlatımı\n..."}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              İptal
            </Button>
            <Button
              type="button"
              disabled={!bulkText.trim() || saving}
              onClick={handleBulkAdd}
            >
              {saving ? "Ekleniyor..." : "Tümünü Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
