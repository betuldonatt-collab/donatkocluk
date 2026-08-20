"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AYT_COURSES_BY_TRACK,
  TRACK_LABELS,
  TYT_COURSES,
  type Course,
  type Track,
} from "@/lib/curriculum";
import { PastQuestionsTable } from "./_components/past-questions-table";

export default function CikmisSorularPage() {
  const [tytCourseId, setTytCourseId] = useState(TYT_COURSES[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(AYT_COURSES_BY_TRACK.sayisal[0].id);

  function handleTrackChange(nextTrack: Track) {
    setTrack(nextTrack);
    setAytCourseId(AYT_COURSES_BY_TRACK[nextTrack][0].id);
  }

  const aytCourses = AYT_COURSES_BY_TRACK[track];
  const tytCourse = TYT_COURSES.find((c) => c.id === tytCourseId) ?? TYT_COURSES[0];
  const aytCourse = aytCourses.find((c) => c.id === aytCourseId) ?? aytCourses[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Çıkmış Sorular</h1>
        <p className="text-muted-foreground text-sm">
          Konuların yıllara göre soru ağırlığı — hangi konudan hangi yıl kaç
          soru çıktığını gösteren referans tablo.
        </p>
      </header>

      <Tabs defaultValue="tyt">
        <TabsList>
          <TabsTrigger value="tyt">TYT</TabsTrigger>
          <TabsTrigger value="ayt">AYT</TabsTrigger>
        </TabsList>

        <TabsContent value="tyt" className="space-y-4">
          <CourseChips courses={TYT_COURSES} selectedId={tytCourseId} onSelect={setTytCourseId} />
          <PastQuestionsTable course={tytCourse} />
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
          <PastQuestionsTable course={aytCourse} />
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
