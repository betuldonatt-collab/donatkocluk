import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GalleryView, type StagedPhoto } from "@/app/student/_components/daily-tasks/photo-capture-flow";

const noop = vi.fn();
const staged = (n: number, edited = false): StagedPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    file: new File(["x"], `f${i}.jpg`, { type: "image/jpeg" }),
    url: `blob:test/${i}`,
    signature: `f${i}.jpg|1|0`,
    edited,
  }));

function render(props: Partial<Parameters<typeof GalleryView>[0]> = {}) {
  return renderToStaticMarkup(
    <GalleryView
      photos={[]}
      uploading={false}
      error={null}
      progress={null}
      onCamera={noop}
      onNativeCamera={noop}
      onPickGallery={noop}
      onEdit={noop}
      onRemove={noop}
      onSubmit={noop}
      {...props}
    />,
  );
}

describe("the staging gallery of the photo flow", () => {
  it("with nothing staged: says so, offers both ways to add photos, and the upload button is disabled", () => {
    const html = render();
    expect(html).toContain("Henüz fotoğraf yok");
    expect(html).toContain("Fotoğraf çek");
    expect(html).toContain("Galeriden ekle");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Yükle<\/button>/);
  });

  it("shows every staged photo numbered, each with delete and edit controls, plus an add tile", () => {
    const html = render({ photos: staged(3) });
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`alt="Fotoğraf ${n}"`);
      expect(html).toContain(`aria-label="${n}. fotoğrafı sil"`);
      expect(html).toContain(`aria-label="${n}. fotoğrafı kırp veya döndür"`);
    }
    expect(html).toContain("blob:test/2");
    expect(html).toContain("Ekle");
    // one submit button for the whole batch
    expect(html).toContain("3 fotoğrafı yükle");
    expect(html.match(/fotoğrafı yükle/g)).toHaveLength(1);
  });

  it("marks an edited photo", () => {
    expect(render({ photos: staged(1, true) })).toContain("düzenlendi");
    expect(render({ photos: staged(1, false) })).not.toContain("düzenlendi");
  });

  it("while uploading: progress is shown and every control is locked", () => {
    const html = render({ photos: staged(2), uploading: true, progress: { phase: "upload", index: 2, total: 2 } });
    expect(html).toContain("Fotoğraf 2/2: yükleniyor...");
    expect(html).toContain("Yükleniyor...");
    // every button (delete, edit, add, camera, gallery, submit, the thumbnail buttons) is disabled
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(6);
    for (const b of buttons) expect(b, b).toContain("disabled");
  });

  it("after a failed upload: the error and its detail show, and the photos stay for another try", () => {
    const html = render({ photos: staged(2), error: { message: "2. fotoğraf: Dosya çok büyük.", detail: "server · 413" } });
    expect(html).toContain("2. fotoğraf: Dosya çok büyük.");
    expect(html).toContain("Hata detayı: server · 413");
    expect(html).toContain("tekrar yükleyebilirsin");
    expect(html).toContain("2 fotoğrafı yükle");
  });
});

describe("no photo limit", () => {
  it("the gallery lists and uploads any number of staged photos", () => {
    const html = render({ photos: staged(120) });
    expect(html.match(/alt="Fotoğraf \d+"/g)).toHaveLength(120);
    expect(html).toContain("120 fotoğrafı yükle");
  });
});
