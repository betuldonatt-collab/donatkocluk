// The Maarif curriculum JSON keeps its sheet numbering ("4.4. Dil Bilgisi ›
// Sıfatlar", "1.6. Sınıflandırma › 1.6.1. Domain Sistemi") so the hierarchy
// and ordering stay readable in the data -- but no student or coach should
// ever see those markers. Stripped once, where the Maarif data is loaded
// (maarif9.ts / maarif10.ts), so every screen shows clean names.
//
// Deeper headings are merged into one name with " › ", and each segment can
// carry its own prefix, so each is stripped. Deliberately NOT applied to
// TYT/AYT/LGS data: their topics legitimately start with numbers ("2.
// Dereceden Denklemler", "20. Yüzyıl Başlarında ...").
const LEADING_NUMBER = /^\d+(?:\.\d+)*\.\s+/;

export function stripTopicNumberPrefix(name: string): string {
  return name
    .split(" › ")
    .map((segment) => segment.replace(LEADING_NUMBER, ""))
    .join(" › ");
}

export function withCleanTopicNames<U extends { topics: { name: string }[] }, C extends { units: U[] }>(courses: C[]): C[] {
  return courses.map(
    (course) =>
      ({
        ...course,
        units: course.units.map((unit) => ({
          ...unit,
          topics: unit.topics.map((topic) => ({ ...topic, name: stripTopicNumberPrefix(topic.name) })),
        })),
      }) as C,
  );
}
