import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StickyXScroll } from "@/components/ui/sticky-x-scroll";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("StickyXScroll", () => {
  it("renders its content in a horizontally scrolling region whose own scrollbar is hidden (the proxy bar replaces it once it overflows)", () => {
    const html = renderToStaticMarkup(
      <StickyXScroll scrollerClassName="pb-2">
        <div className="min-w-[1260px]">week</div>
      </StickyXScroll>,
    );
    expect(html).toContain("week");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("[scrollbar-width:none]");
    expect(html).toContain("pb-2");
    // no overflow is known on the server, so no proxy bar is rendered yet
    expect(html).not.toContain("sticky-x-scrollbar");
  });
});

describe("where it is used", () => {
  it.each([
    ["student Kaynak Takibi: question/resource table", "../app/student/kaynak-takibi/_components/course-table.tsx"],
    ["student Kaynak Takibi: branch-exam stock", "../app/student/kaynak-takibi/_components/branch-exam-stock-table.tsx"],
    ["coach Kaynak Takibi: question/resource table", "../app/coach/students/[id]/_components/editable-course-table.tsx"],
    ["coach Kaynak Takibi: branch-exam stock", "../app/coach/students/[id]/_components/branch-exam-stock-table.tsx"],
    ["coach program: weekly planner", "../app/coach/students/[id]/schedule/schedule-board.tsx"],
    ["coach program: program tab", "../app/coach/students/[id]/_components/program-tab.tsx"],
  ])("%s", (_name, file) => {
    const src = read(file);
    expect(src).toContain("<StickyXScroll");
    expect(src).toContain("</StickyXScroll>");
    expect(src).not.toContain('<div className="overflow-x-auto');
  });
});

describe("the page itself must not be a scroll container", () => {
  // position: sticky resolves against the nearest scroll container; overflow-x: hidden on body made body one, so a sticky bar stayed at
  // its natural place at the end of a tall table. (Verified in a browser: bar at y=1939 in a 358px viewport with hidden, 358 with clip.)
  it("body uses overflow-x: clip, not overflow-x: hidden", () => {
    const css = read("../app/globals.css");
    const body = css.slice(css.indexOf("  body {"), css.indexOf("  body {") + 1500);
    expect(body).toContain("overflow-x: clip;");
    expect(body).not.toMatch(/@apply[^;]*overflow-x-hidden/);
  });
});
