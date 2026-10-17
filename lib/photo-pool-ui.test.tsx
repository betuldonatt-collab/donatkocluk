import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/students/[id]/photos/actions", () => ({
  getAnnotationUrls: vi.fn(),
  saveAnnotatedPhoto: vi.fn(),
  removePhotoAnnotation: vi.fn(),
  createPhotoFolder: vi.fn(),
  renamePhotoFolder: vi.fn(),
  deletePhotoFolder: vi.fn(),
  movePhotosToFolder: vi.fn(),
  getPhotoUrls: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PhotoPoolGallery } from "@/app/coach/students/[id]/photos/photo-pool-gallery";
import { buildPhotoPool } from "@/lib/photo-pool";

const S = "22222222-2222-4222-8222-222222222222";
const pool = buildPhotoPool(
  [
    { id: "t1", task_date: "2026-10-01", task_type: "question_solving", title: "Paragraf testi", course_id: "tyt-matematik", evidence_image_paths: [`${S}/t1/a.jpg`, `${S}/t1/b.jpg`] },
    { id: "t2", task_date: "2026-10-05", task_type: "general_exam", title: "TYT Deneme 3", course_id: null, evidence_image_paths: [`${S}/t2/c.jpg`], evidence_photo_status: { [`${S}/t2/c.jpg`]: "rejected" } },
  ],
  new Map([[`${S}/t1/a.jpg`, "f1"]]),
);
const folders = [
  { id: "f1", name: "Soru Bankası", courseKey: "tyt-matematik" },
  { id: "f2", name: "Deneme", courseKey: "genel-deneme" },
];

function render(over: Partial<Parameters<typeof PhotoPoolGallery>[0]> = {}) {
  return renderToStaticMarkup(<PhotoPoolGallery studentId={S} initialPhotos={pool} initialFolders={folders} foldersAvailable {...over} />);
}

describe("PhotoPoolGallery", () => {
  it("shows the sidebar: Tümü, Klasörsüz, each folder with its count, and the add control", () => {
    const html = render();
    expect(html).toContain("Tümü");
    expect(html).toContain("Klasörsüz");
    expect(html).toContain("Soru Bankası");
    expect(html).toContain("Deneme");
    expect(html).toContain("Yeni Klasör");
  });

  it("offers the Ders and date filters, with only the courses that have photos", () => {
    const html = render();
    expect(html).toContain("Ders");
    expect(html).toContain("Başlangıç tarihi");
    expect(html).toContain("Bitiş tarihi");
    expect(html).not.toContain("Tüm dersler"); // the sidebar courses are the Ders filter now
    expect(html).toContain("Genel Deneme");
    expect(html).toContain("3 fotoğraf");
  });

  it("renders one draggable, selectable card per photo with its course, date and task", () => {
    const html = render();
    expect((html.match(/draggable="true"/g) ?? []).length).toBe(3);
    expect((html.match(/aria-label="Fotoğrafı seç"/g) ?? []).length).toBe(3);
    expect(html).toContain("01.10.2026");
    expect(html).toContain("Paragraf testi");
    expect(html).toContain("Onaylanmadı");
  });

  it("hints at both ways to file photos (Taşı and drag and drop)", () => {
    expect(render()).toContain("Taşı");
  });

  it("without migration 0139 the photos still show but cannot be dragged, and the folder control explains why", () => {
    const html = render({ foldersAvailable: false, initialFolders: [] });
    expect((html.match(/draggable="true"/g) ?? []).length).toBe(0);
    expect(html).toContain("0139");
    expect(html).not.toContain("Yeni Klasör");
  });

  it("an empty pool is an empty state, not a blank page", () => {
    const html = render({ initialPhotos: [] });
    expect(html).toContain("Henüz fotoğraf yok");
  });
});

describe("PhotoPoolGallery: sections", () => {
  const mixed = buildPhotoPool(
    [
      { id: "m", task_date: "2026-10-03", task_type: "question_bank", title: "Matematik soruları", course_id: "tyt-matematik", evidence_image_paths: [`${S}/m/a.jpg`] },
      { id: "p", task_date: "2026-10-04", task_type: "question_bank", title: "Paragraf rutini", course_id: "paragraf", evidence_image_paths: [`${S}/p/a.jpg`, `${S}/p/b.jpg`] },
      { id: "q", task_date: "2026-10-05", task_type: "question_bank", title: "Problem rutini", course_id: "problem", evidence_image_paths: [`${S}/q/a.jpg`] },
    ],
    new Map(),
    new Map([[`${S}/m/a.jpg`, "coach/student/m.jpg"]]),
  );

  it("groups the photos under headers: a course for Standard tasks, 'Rutin - <type>' for routines", () => {
    const html = renderToStaticMarkup(<PhotoPoolGallery studentId={S} initialPhotos={mixed} initialFolders={[]} foldersAvailable annotationsAvailable />);
    const headers = [...html.matchAll(/<h2[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(headers).toHaveLength(3);
    // the course section comes before the routine sections
    expect(headers.slice(1)).toEqual(["Rutin - Paragraf", "Rutin - Problem"]);
    expect(headers[0]).not.toMatch(/^Rutin/);
    expect(html).toContain("2 fotoğraf"); // the Paragraf section
    expect(html).toContain("Bölümü seç");
  });

  it("marks a photo the coach has edited", () => {
    const html = renderToStaticMarkup(<PhotoPoolGallery studentId={S} initialPhotos={mixed} initialFolders={[]} foldersAvailable annotationsAvailable />);
    expect((html.match(/Düzenlendi/g) ?? []).length).toBe(1);
  });
});

describe("PhotoPoolGallery: courses with nested folders", () => {
  const S2 = S;
  const photos = buildPhotoPool(
    [
      { id: "m", task_date: "2026-10-03", task_type: "question_bank", title: "Mat", course_id: "tyt-matematik", evidence_image_paths: [`${S2}/m/a.jpg`, `${S2}/m/b.jpg`] },
      { id: "f", task_date: "2026-10-04", task_type: "question_bank", title: "Fizik", course_id: "tyt-fizik", evidence_image_paths: [`${S2}/f/a.jpg`] },
    ],
    new Map([[`${S2}/m/a.jpg`, "fm"]]),
  );
  const nested = [
    { id: "fm", name: "Soru Bankası", courseKey: "tyt-matematik" },
    { id: "ff", name: "Soru Bankası", courseKey: "tyt-fizik" },
    { id: "legacy", name: "Eski Klasör", courseKey: null },
  ];
  const html = renderToStaticMarkup(<PhotoPoolGallery studentId={S2} initialPhotos={photos} initialFolders={nested} foldersAvailable />);
  const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));

  it("the sidebar lists the courses, not a flat list of folders", () => {
    expect(aside).toContain("Dersler");
    expect((aside.match(/aria-label="[^"]*klasörlerini daralt"/g) ?? []).length).toBe(2); // one expandable course each for math and physics
    expect(aside).not.toContain("Genel Deneme"); // a course with no photos or folders is not listed
  });

  it("each folder appears under its own course, even when two courses use the same name", () => {
    // sections are in label order: Fizik, then Matematik
    const physicsSection = aside.slice(aside.indexOf("TYT Fizik"), aside.indexOf("TYT Matematik"));
    expect(physicsSection).toContain("Soru Bankası");
    expect(aside.slice(aside.indexOf("TYT Matematik"))).toContain("Soru Bankası");
    expect((aside.match(/Soru Bankası/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("a course with folders has a nested 'Klasörsüz' entry", () => {
    expect((aside.match(/Klasörsüz/g) ?? []).length).toBe(2);
  });

  it("a folder from before courses is listed apart", () => {
    expect(aside).toContain("Dersi olmayan klasörler");
    expect(aside).toContain("Eski Klasör");
  });

  it("the toolbar has no separate Ders dropdown any more (the sidebar's courses filter the gallery)", () => {
    const main = html.slice(html.indexOf("</aside>"));
    expect(main).not.toContain("Tüm dersler");
    expect(main).toContain("Başlangıç tarihi");
  });

  it("adding a folder is offered per course and globally", () => {
    expect(aside).toContain("Yeni Klasör Ekle");
    expect(aside).toMatch(/dersine klasör ekle/);
  });

  it("without migration 0141 the old folders stay and new ones are explained away", () => {
    const old = renderToStaticMarkup(
      <PhotoPoolGallery studentId={S2} initialPhotos={photos} initialFolders={[{ id: "legacy", name: "Eski Klasör", courseKey: null }]} foldersAvailable courseFoldersAvailable={false} />,
    );
    expect(old).toContain("0141");
    expect(old).not.toContain("Yeni Klasör Ekle");
    expect(old).toContain("Eski Klasör");
  });
});
