"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, School } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Course } from "@/lib/curriculum";
import { MAARIF9_KAYNAK_COURSES } from "@/lib/curriculum/maarif9";
import { MAARIF10_KAYNAK_COURSES } from "@/lib/curriculum/maarif10";
import { stripGradePrefix } from "@/lib/maarif-grade";

// Same card language as the 11th-grade page (app/student/11-sinif-maarif/
// maarif-11-dashboard.tsx) minus the progress bar -- this is purely
// informational (sign-off: "we don't need checkboxes next to every tiny
// detail, it can just be present as detailed information"). A card's own
// button expands its units/topics inline, same expand-in-place pattern.
function CourseCard({ course }: { course: Course }) {
  const [expanded, setExpanded] = useState(false);
  const hasUnits = course.units.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl leading-snug">{stripGradePrefix(course.name)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-base"
          onClick={() => setExpanded((e) => !e)}
          disabled={!hasUnits}
        >
          {!hasUnits ? "Konu Yok" : expanded ? "Konuları Gizle" : "Konuları Gör"}
          {hasUnits && (expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />)}
        </Button>

        {expanded && hasUnits && (
          <div className="space-y-4 border-t pt-4">
            {course.units.map((unit, i) => (
              // Unit (lib/curriculum) carries no id of its own, only its
              // label -- index is stable here since this list is static data.
              <div key={`${course.id}-u${i}`} className="space-y-2">
                {unit.unit && <p className="text-foreground text-sm font-medium">{unit.unit}</p>}
                <ul className="space-y-1.5 pl-1">
                  {unit.topics.map((topic) => (
                    <li key={topic.id} className="flex items-center gap-2 text-sm">
                      <span className="bg-muted-foreground/40 size-1.5 shrink-0 rounded-full" />
                      <span className="text-muted-foreground">{topic.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CourseGrid({ courses }: { courses: Course[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}

export function Tyt9And10Dashboard({ defaultGrade }: { defaultGrade: 9 | 10 }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <School className="text-primary size-8" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">9-10. Sınıf (TYT)</h1>
          <p className="text-muted-foreground text-base">Sınıfını seç, ders ve konularını incele.</p>
        </div>
      </div>

      <Tabs defaultValue={String(defaultGrade)}>
        <TabsList>
          <TabsTrigger value="9">9. Sınıf</TabsTrigger>
          <TabsTrigger value="10">10. Sınıf</TabsTrigger>
        </TabsList>
        <TabsContent value="9" className="pt-6">
          <CourseGrid courses={MAARIF9_KAYNAK_COURSES} />
        </TabsContent>
        <TabsContent value="10" className="pt-6">
          <CourseGrid courses={MAARIF10_KAYNAK_COURSES} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
