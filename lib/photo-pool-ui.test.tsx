import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/students/[id]/photos/actions", () => ({
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
  { id: "f1", name: "Soru Bankası" },
  { id: "f2", name: "Deneme" },
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
    expect(html).toContain("Genel Deneme (1)");
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
