import { describe, expect, it } from "vitest";
import {
  countTemplateTasks,
  defaultTemplateStart,
  describeDays,
  isMonday,
  rowsPerDate,
  summarizeTemplateTask,
  templateDates,
  type TemplateItem,
} from "./weekly-template";

describe("isMonday", () => {
  it("accepts a Monday and rejects every other day and malformed input", () => {
    expect(isMonday("2026-09-21")).toBe(true); // Monday
    expect(isMonday("2026-09-22")).toBe(false);
    expect(isMonday("2026-09-27")).toBe(false); // Sunday
    expect(isMonday("nope")).toBe(false);
  });
});

describe("templateDates", () => {
  it("maps weekday numbers onto the week's real dates, sorted and de-duplicated", () => {
    expect(templateDates("2026-09-21", [6, 0, 0, 5])).toEqual(["2026-09-21", "2026-09-26", "2026-09-27"]);
  });

  it("crosses a month boundary correctly and ignores out-of-range days", () => {
    expect(templateDates("2026-09-28", [0, 3, 4, 9, -1])).toEqual(["2026-09-28", "2026-10-01", "2026-10-02"]);
  });
});

describe("defaultTemplateStart", () => {
  it("is today when today is a Monday, otherwise the coming Monday", () => {
    expect(defaultTemplateStart("2026-09-21")).toBe("2026-09-21");
    expect(defaultTemplateStart("2026-09-23")).toBe("2026-09-28");
    expect(defaultTemplateStart("2026-09-27")).toBe("2026-09-28");
  });
});

describe("countTemplateTasks", () => {
  const items: TemplateItem[] = [
    { days: [0, 1, 2, 3, 4, 5, 6], task: { taskType: "reading", totalCount: 15 } }, // 7
    { days: [0, 1, 2, 3, 4], task: { taskType: "topic_study", courseId: "lgs-matematik" } }, // 5
    { days: [5], task: { taskType: "general_exam", generalExamTrack: "lgs" } }, // 1
  ];

  it("counts one card per day per item", () => {
    expect(countTemplateTasks(items)).toBe(13);
  });

  it("a video task with several links creates one card per link per day", () => {
    const video: TemplateItem = {
      days: [0, 2],
      task: {
        taskType: "video",
        videoLinks: [
          { url: "https://a", title: null },
          { url: "https://b", title: null },
          { url: "https://c", title: null },
        ],
      },
    };
    expect(rowsPerDate(video.task)).toBe(3);
    expect(countTemplateTasks([video])).toBe(6);
  });
});

describe("summarizeTemplateTask", () => {
  it("describes a book reading item with pages", () => {
    expect(summarizeTemplateTask({ taskType: "reading", totalCount: 15 })).toBe("Kitap Okuma · 15 sayfa");
    expect(summarizeTemplateTask({ taskType: "reading", bookTitle: "Sefiller", totalCount: 10 })).toBe("Sefiller · 10 sayfa");
  });

  it("describes a general exam by its track", () => {
    expect(summarizeTemplateTask({ taskType: "general_exam", generalExamTrack: "lgs" })).toBe("LGS Genel Deneme");
    expect(summarizeTemplateTask({ taskType: "general_exam", generalExamTrack: "ayt" })).toBe("AYT Genel Deneme");
  });

  it("describes the Yeni Nesil Mat Dozu routine by its own name", () => {
    expect(
      summarizeTemplateTask({ taskType: "question_bank", courseId: "yeni-nesil-mat-dozu", totalCount: 10 }),
    ).toBe("Soru Çözümü · Yeni Nesil Mat Dozu · 10 soru");
  });

  it("includes duration when set", () => {
    expect(summarizeTemplateTask({ taskType: "question_bank", courseId: "paragraf", totalCount: 20, durationMinutes: 30 })).toBe(
      "Soru Çözümü · Paragraf · 20 soru · 30 dk",
    );
  });
});

describe("describeDays", () => {
  it("uses friendly names for the common patterns", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Her gün");
    expect(describeDays([4, 3, 2, 1, 0])).toBe("Hafta içi");
    expect(describeDays([5, 6])).toBe("Hafta sonu");
  });

  it("lists other combinations in week order", () => {
    expect(describeDays([5, 0, 2])).toBe("Pzt, Çar, Cmt");
  });
});
