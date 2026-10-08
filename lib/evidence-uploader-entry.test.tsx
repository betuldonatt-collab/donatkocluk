import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("../app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { EvidenceUploader } from "@/app/student/_components/daily-tasks/evidence-uploader";

describe("the main entry points of the Kanıt Fotoğrafı block", () => {
  const html = renderToStaticMarkup(
    <EvidenceUploader taskId="t1" paths={[]} reviewStatus="none" photoStatus={{}} onChange={() => {}} />,
  );

  it("offers the camera flow and, separately, a direct gallery picker", () => {
    expect(html).toContain("Fotoğraf Ekle");
    expect(html).toContain("Galeriden Seç");
  });

  it("the gallery picker is a multi-file input with no count cap", () => {
    const input = html.match(/<input[^>]*multiple[^>]*>/)?.[0] ?? "";
    expect(input).toContain('type="file"');
    expect(input).toContain('accept="image/*"');
    expect(input).not.toMatch(/max/i);
  });
});
