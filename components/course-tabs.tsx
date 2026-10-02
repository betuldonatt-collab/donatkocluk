"use client";

import { useState, type ReactNode } from "react";
import { BookOpenCheck } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { AYT_COURSES_BY_TRACK, LGS_COURSES, TRACK_LABELS, TYT_COURSES, type Course, type Track } from "@/lib/curriculum";
import { LGS_SUBJECT_GROUPS } from "@/lib/curriculum/subject-groups";
import { MAARIF_TYT_MERGED_COURSES } from "@/lib/curriculum/maarif-tyt";
import { tracksForMaarif11Course, type Maarif11Track } from "@/lib/curriculum/maarif11";
import type { ExamType } from "@/lib/exam-type";
import { useMaarifGrade } from "@/components/maarif-grade-context";
import { MAARIF_GRADES, stripGradePrefix } from "@/lib/maarif-grade";

const MAARIF11_TRACK_LABELS: Record<Maarif11Track, string> = { sayisal: "Sayısal", ea: "Eşit Ağırlık", sozel: "Sözel" };

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
  const maarifGrade = useMaarifGrade();
  const [m9CourseId, setM9CourseId] = useState("");
  // 11th grade only: "Maarif TYT" tab (9th+10th merged) and its own
  // "11. Sınıf" tab (track-filtered, once real course data exists).
  const [maarifTytCourseId, setMaarifTytCourseId] = useState(MAARIF_TYT_MERGED_COURSES[0]?.id ?? "");
  const [m11Track, setM11Track] = useState<Maarif11Track>("sayisal");
  const [m11CourseId, setM11CourseId] = useState("");

  // 11th grade: Kaynak Takibi lives as two tabs instead of one flat chip
  // row -- "Maarif TYT" (9th+10th grade merged, since TYT prep is
  // cumulative across both years) and the student's own "11. Sınıf"
  // subjects, filtered by a free, one-click Sayısal/EA/Sözel switcher (same
  // ephemeral, not-saved-to-the-DB pattern as the existing AYT track tabs
  // below -- no new persistence). 9th and 10th graders keep the single
  // flat-chip-row behavior further below, completely unchanged.
  if (maarifGrade === 11 && examType !== "LGS") {
    const m11Courses = MAARIF_GRADES[11].courses.filter((c) => tracksForMaarif11Course(c.id).includes(m11Track));
    const selectedMaarifTyt = MAARIF_TYT_MERGED_COURSES.find((c) => c.id === maarifTytCourseId) ?? MAARIF_TYT_MERGED_COURSES[0];
    const selectedM11 = m11Courses.find((c) => c.id === m11CourseId) ?? m11Courses[0];
    return (
      <Tabs defaultValue="maarif-tyt">
        <TabsList>
          <TabsTrigger value="maarif-tyt">Maarif TYT</TabsTrigger>
          <TabsTrigger value="m11">11. Sınıf</TabsTrigger>
        </TabsList>

        <TabsContent value="maarif-tyt" className="space-y-4 pt-4">
          {selectedMaarifTyt ? (
            <>
              <CourseChips courses={MAARIF_TYT_MERGED_COURSES} selectedId={selectedMaarifTyt.id} onSelect={setMaarifTytCourseId} />
              {render(selectedMaarifTyt)}
            </>
          ) : (
            <EmptyState icon={BookOpenCheck} title="Müfredat henüz eklenmedi" description="9. ve 10. sınıf TYT müfredatı hazırlandığında burada görünecek." />
          )}
        </TabsContent>

        <TabsContent value="m11" className="space-y-4 pt-4">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {(Object.keys(MAARIF11_TRACK_LABELS) as Maarif11Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setM11Track(t);
                  setM11CourseId("");
                }}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  m11Track === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {MAARIF11_TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          {selectedM11 ? (
            <>
              <CourseChips
                courses={m11Courses.map((c) => ({ ...c, name: stripGradePrefix(c.name) }))}
                selectedId={selectedM11.id}
                onSelect={setM11CourseId}
              />
              {render(selectedM11)}
            </>
          ) : (
            <EmptyState
              icon={BookOpenCheck}
              title="Müfredat henüz eklenmedi"
              description={`11. Sınıf ${MAARIF11_TRACK_LABELS[m11Track]} ders listesi hazırlandığında burada görünecek.`}
            />
          )}
        </TabsContent>
      </Tabs>
    );
  }

  // 9th/10th grade: one chip row of that grade's own subjects, no TYT/AYT
  // (or Maarif TYT / 11. Sınıf) split -- every page built on this component
  // adapts at once. Unchanged from before 11th grade got its own two-tab
  // view above.
  if (maarifGrade !== null && examType !== "LGS") {
    const gradeCourses = MAARIF_GRADES[maarifGrade].courses;
    if (gradeCourses.length === 0) {
      return (
        <EmptyState
          icon={BookOpenCheck}
          title="Müfredat henüz eklenmedi"
          description={`${MAARIF_GRADES[maarifGrade].label} için ders listesi hazırlandığında burada görünecek.`}
        />
      );
    }
    const selected = gradeCourses.find((c) => c.id === m9CourseId) ?? gradeCourses[0];
    return (
      <div className="space-y-4">
        <CourseChips
          courses={gradeCourses.map((c) => ({ ...c, name: stripGradePrefix(c.name) }))}
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
