"use client";

import { useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AYT_COURSES_BY_TRACK, LGS_COURSES, TRACK_LABELS, TYT_COURSES, type Course, type Track } from "@/lib/curriculum";
import { LGS_SUBJECT_GROUPS } from "@/lib/curriculum/subject-groups";
import type { ExamType } from "@/lib/exam-type";
import { useIsMaarif9 } from "@/components/maarif9-context";
import { MAARIF9_KAYNAK_COURSES } from "@/lib/curriculum/maarif9";

export function CourseChips({
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

// The shared "pick a subject" chrome behind every curriculum page that used
// to hard-code TYT / AYT tabs + the AYT track pills + a chip row (Kaynak
// Takibi, Çıkmış Sorular, Kaynak Kütüphanesi, Branş analizi, Gelişim
// Haritası, the coach's Konu Performans Haritası, ...).
//
// YKS renders exactly that chrome. LGS has no TYT/AYT split and no track, so
// it renders one set of chips grouped under SÖZEL / SAYISAL headings
// instead. `render` receives the selected course either way, so a page
// supplies only what it shows per course. Pages whose chip lists include
// extra courses (branş denemesi's macro "TYT Fen" style subjects) pass
// their own tytCourses / aytCoursesFor.
export function CourseTabs({
  examType = "YKS",
  tytCourses = TYT_COURSES,
  aytCoursesFor = (t: Track) => AYT_COURSES_BY_TRACK[t],
  lgsCourses = LGS_COURSES,
  render,
}: {
  examType?: ExamType;
  tytCourses?: Course[];
  aytCoursesFor?: (track: Track) => Course[];
  lgsCourses?: Course[];
  render: (course: Course) => ReactNode;
}) {
  const [tytCourseId, setTytCourseId] = useState(tytCourses[0].id);
  const [track, setTrack] = useState<Track>("sayisal");
  const [aytCourseId, setAytCourseId] = useState(aytCoursesFor("sayisal")[0].id);
  const [lgsCourseId, setLgsCourseId] = useState(lgsCourses[0].id);
  const isMaarif9 = useIsMaarif9();
  const [m9CourseId, setM9CourseId] = useState(MAARIF9_KAYNAK_COURSES[0].id);

  // 9th graders (profiles.is_maarif9): one chip row of the 9th-grade subjects,
  // no TYT/AYT split -- every page built on this component adapts at once.
  if (isMaarif9 && examType !== "LGS") {
    const selected = MAARIF9_KAYNAK_COURSES.find((c) => c.id === m9CourseId) ?? MAARIF9_KAYNAK_COURSES[0];
    return (
      <div className="space-y-4">
        <CourseChips
          courses={MAARIF9_KAYNAK_COURSES.map((c) => ({ ...c, name: c.name.replace(/^9\.\s*Sınıf:?\s*/i, "") }))}
          selectedId={selected.id}
          onSelect={setM9CourseId}
        />
        {render(selected)}
      </div>
    );
  }

  if (examType === "LGS") {
    const selected = lgsCourses.find((c) => c.id === lgsCourseId) ?? lgsCourses[0];
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {LGS_SUBJECT_GROUPS.map((group) => {
            const groupCourses = group.courseIds
              .map((id) => lgsCourses.find((c) => c.id === id))
              .filter((c): c is Course => !!c);
            if (groupCourses.length === 0) return null;
            return (
              <div key={group.key} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-16 text-[10px] font-semibold tracking-wide uppercase">
                  {group.label}
                </span>
                <CourseChips courses={groupCourses} selectedId={selected.id} onSelect={setLgsCourseId} />
              </div>
            );
          })}
        </div>
        {render(selected)}
      </div>
    );
  }

  function handleTrackChange(next: Track) {
    setTrack(next);
    setAytCourseId(aytCoursesFor(next)[0].id);
  }

  const aytCourses = aytCoursesFor(track);
  const tytCourse = tytCourses.find((c) => c.id === tytCourseId) ?? tytCourses[0];
  const aytCourse = aytCourses.find((c) => c.id === aytCourseId) ?? aytCourses[0];

  return (
    <Tabs defaultValue="tyt">
      <TabsList>
        <TabsTrigger value="tyt">TYT</TabsTrigger>
        <TabsTrigger value="ayt">AYT</TabsTrigger>
      </TabsList>

      <TabsContent value="tyt" className="space-y-4 pt-4">
        <CourseChips courses={tytCourses} selectedId={tytCourse.id} onSelect={setTytCourseId} />
        {render(tytCourse)}
      </TabsContent>

      <TabsContent value="ayt" className="space-y-4 pt-4">
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTrackChange(t)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                track === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TRACK_LABELS[t]}
            </button>
          ))}
        </div>

        <CourseChips courses={aytCourses} selectedId={aytCourse.id} onSelect={setAytCourseId} />
        {render(aytCourse)}
      </TabsContent>
    </Tabs>
  );
}
