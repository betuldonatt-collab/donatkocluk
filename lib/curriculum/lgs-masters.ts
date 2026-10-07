// LGS (8th grade) unit masters -- FEN BİLİMLERİ ONLY (user decision 2026-10-07; every other LGS course stays a flat list,
// see the memory note project-lgs-fen-unit-master). Other levels offer a unit as ONE "<Unit> (Genel)" master topic plus its
// subtopics (the two-step Ünite -> Konu picker of the task forms, the parent row of Kaynak Takibi -- see
// lib/curriculum/topic-groups.ts). LGS Fen gets the same, with one LGS-specific rule: the second step lists the Konu
// SELECTION NODES of the unit (lib/curriculum/lgs-selection.ts), never the raw Alt konu topics.
//
// A master is a real topic, added to the raw course when it is loaded (lib/curriculum/index.ts -> LGS_COURSES): an entry
// of its own, placed FIRST in its unit, holding that one topic. Nothing that exists changes: every existing topic keeps
// its id, every selection node keeps its id (= a real topic id, the first topic it rolls up), so tasks, pipeline ticks,
// resource progress and mistakes saved before this change keep landing on the same rows.
//
// Only the units that offer a real choice get a master -- the ones with at least two selection nodes. Every Fen Bilimleri
// unit qualifies (Ünite 1-6 list their Konu as topics, Ünite 7 has three Konu entries), so all seven get one. Matematik,
// Din Kültürü, Türkçe, İnkılap Tarihi and İngilizce get no master at all.
//
// This module is a leaf (it imports nothing at run time) so that lib/curriculum/index.ts can use it while it is still
// being evaluated.
import type { Course } from "./index";

type UnitMaster = { unit: string; name: string };

// raw unit label (as lgs.json has it) -> the master's name, which reads like the unit's other labels in the lists
const LGS_UNIT_MASTERS: Record<string, UnitMaster[]> = {
  "lgs-fen-bilimleri": [
    { unit: "1. ÜNİTE: MEVSİMLER VE İKLİM", name: "1. Ünite: Mevsimler ve İklim (Genel)" },
    { unit: "2. ÜNİTE: DNA ve GENETİK KOD", name: "2. Ünite: Dna ve Genetik Kod (Genel)" },
    { unit: "3. ÜNİTE: BASINÇ", name: "3. Ünite: Basınç (Genel)" },
    { unit: "4. ÜNİTE: MADDE ve ENDÜSTRİ", name: "4. Ünite: Madde ve Endüstri (Genel)" },
    { unit: "5. ÜNİTE: BASİT MAKİNELER", name: "5. Ünite: Basit Makineler (Genel)" },
    { unit: "6. ÜNİTE: ENERJİ DÖNÜŞÜMLERİ ve ÇEVRE BİLİMİ", name: "6. Ünite: Enerji Dönüşümleri ve Çevre Bilimi (Genel)" },
    { unit: "7. ÜNİTE: ELEKTRİK YÜKLERİ VE ELEKTRİK ENERJİSİ", name: "7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)" },
  ],
};

// The id of a generated master: "<courseId>-genel-u<n>", n = the position of the unit's label among the course's distinct
// unit labels (the same convention as every other course's masters, see unitMasterId in topic-groups.ts).
export function isLgsMasterId(id: string): boolean {
  return /-genel-u\d+$/.test(id);
}

export function lgsMasterUnitLabels(courseId: string): string[] {
  return (LGS_UNIT_MASTERS[courseId] ?? []).map((m) => m.unit);
}

export function withLgsUnitMasters(course: Course): Course {
  const masters = LGS_UNIT_MASTERS[course.id];
  if (!masters) return course;
  const labels: string[] = [];
  for (const u of course.units) if (!labels.includes(u.unit)) labels.push(u.unit);

  const units: Course["units"] = [];
  const done = new Set<string>();
  for (const entry of course.units) {
    const master = masters.find((m) => m.unit === entry.unit);
    if (master && !done.has(master.unit)) {
      done.add(master.unit);
      units.push({ unit: entry.unit, topics: [{ id: `${course.id}-genel-u${labels.indexOf(entry.unit)}`, name: master.name }] });
    }
    units.push(entry);
  }
  return { ...course, units };
}

// The course as lgs.json defines it, without the generated masters.
export function withoutLgsMasters(course: Course): Course {
  return {
    ...course,
    units: course.units.filter((u) => !(u.topics.length === 1 && isLgsMasterId(u.topics[0].id))),
  };
}
