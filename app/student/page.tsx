"use client";

import { useState } from "react";
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  Upload,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TaskStatus = "pending" | "done" | "not_done";

type Task = {
  id: string;
  title: string;
  subtitle: string;
};

type TaskState = {
  status: TaskStatus;
  reason?: string;
  note?: string;
};

const DAILY_TASKS: Task[] = [
  { id: "d1", title: "Matematik: Türev Soru Bankası", subtitle: "20 soru" },
  { id: "d2", title: "Fizik: Konu Tekrarı", subtitle: "Kuvvet ve Hareket" },
  { id: "d3", title: "İngilizce: Kelime Ezberi", subtitle: "30 kelime" },
];

const WEEKLY_TASKS: Task[] = [
  { id: "w1", title: "TYT Genel Deneme Sınavı", subtitle: "135 dakika" },
  { id: "w2", title: "Kimya: Ünite Tekrarı", subtitle: "Mol Kavramı" },
  { id: "w3", title: "Haftalık Özet Çıkarma", subtitle: "Tüm dersler" },
];

const EXCUSE_REASONS = [
  "Zamanım yetmedi",
  "Konuyu henüz çalışmadım",
  "Önceki görevlerim uzadı",
  "Kaynağım yanımda değildi",
  "Kendimi iyi hissetmiyordum",
  "Yapmayı unuttum",
  "Diğer",
] as const;

function initialTaskState(tasks: Task[]): Record<string, TaskState> {
  return Object.fromEntries(tasks.map((t) => [t.id, { status: "pending" as const }]));
}

export default function StudentPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly">("daily");
  const [dailyState, setDailyState] = useState(() => initialTaskState(DAILY_TASKS));
  const [weeklyState, setWeeklyState] = useState(() => initialTaskState(WEEKLY_TASKS));

  const tasks = activeTab === "daily" ? DAILY_TASKS : WEEKLY_TASKS;
  const taskState = activeTab === "daily" ? dailyState : weeklyState;
  const setTaskState = activeTab === "daily" ? setDailyState : setWeeklyState;

  function updateTask(id: string, patch: Partial<TaskState>) {
    setTaskState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Öğrenci Paneli</h1>
        <p className="text-muted-foreground text-sm">
          Günlük ve haftalık görevlerini takip et, çalıştığını kanıtla.
        </p>
      </header>

      <div className="mb-6 inline-flex rounded-lg bg-secondary p-1">
        <button
          type="button"
          onClick={() => setActiveTab("daily")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "daily"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Clock className="size-4" />
          Günlük Ödevler
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("weekly")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "weekly"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Calendar className="size-4" />
          Haftalık Ödevler
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              state={taskState[task.id]}
              onChange={(patch) => updateTask(task.id, patch)}
            />
          ))}
        </div>

        {activeTab === "daily" && (
          <div className="space-y-4">
            <PhotoUploadCard
              icon={Camera}
              title="Günlük Kronometre Fotoğrafı"
              description="O gün çalıştığını gösteren kronometre fotoğrafını yükle."
            />
            <PhotoUploadCard
              icon={ImagePlus}
              title="Ek Fotoğraflar"
              description="Gerekirse ders çalışma kanıtı için ekstra fotoğraf ekle."
              multiple
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  state,
  onChange,
}: {
  task: Task;
  state: TaskState;
  onChange: (patch: Partial<TaskState>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{task.title}</CardTitle>
        <CardDescription>{task.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={state.status === "done" ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ status: "done", reason: undefined, note: undefined })}
          >
            <CheckCircle2 className="size-4" />
            Tamamlandı
          </Button>
          <Button
            type="button"
            variant={state.status === "not_done" ? "destructive" : "outline"}
            size="sm"
            onClick={() => onChange({ status: "not_done" })}
          >
            <XCircle className="size-4" />
            Yapılamadı
          </Button>
        </div>

        {state.status === "not_done" && (
          <div className="border-border space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Neden yapamadın?</p>
            <div className="flex flex-wrap gap-2">
              {EXCUSE_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={state.reason === reason}
                  onClick={() => onChange({ reason })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    state.reason === reason
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>

            {state.reason === "Diğer" && (
              <Textarea
                placeholder="Kısaca açıkla..."
                value={state.note ?? ""}
                onChange={(e) => onChange({ note: e.target.value })}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Photo = { id: string; url: string; name: string };

function PhotoUploadCard({
  icon: Icon,
  title,
  description,
  multiple = false,
}: {
  icon: typeof Camera;
  title: string;
  description: string;
  multiple?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newPhotos = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPhotos((prev) => (multiple ? [...prev, ...newPhotos] : newPhotos));
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const toRemove = prev.find((p) => p.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  const inputId = `photo-upload-${title}`;

  return (
    <Card>
      <CardHeader>
        <Icon className="text-primary size-6" />
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not an optimizable remote asset */}
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="bg-foreground/70 text-background absolute top-1 right-1 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Fotoğrafı kaldır"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          htmlFor={inputId}
          className="border-input hover:bg-accent flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors"
        >
          <Upload className="text-muted-foreground size-5" />
          <span className="text-muted-foreground text-xs">
            {multiple ? "Fotoğraf ekle" : "Fotoğraf yükle"}
          </span>
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </CardContent>
    </Card>
  );
}
