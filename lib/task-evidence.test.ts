import { describe, expect, it } from "vitest";
import {
  evidenceFolder,
  evidencePath,
  fitWithin,
  isEvidenceMimeType,
  isEvidencePathFor,
  shouldHoldForEvidenceReview,
  applyPhotoDecisions,
  evidenceFileSignature,
  evidenceOutcome,
  splitDuplicateFiles,
  normalizePhotoStatus,
  withoutPath,
  withoutRejected,
} from "./task-evidence";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";

describe("isEvidencePathFor", () => {
  it("accepts a file directly inside the student's folder for that task", () => {
    expect(isEvidencePathFor(evidencePath(STUDENT, TASK, "abc", "image/jpeg"), STUDENT, TASK)).toBe(true);
  });

  it("rejects another student's folder, another task's folder, nested paths and traversal", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    expect(isEvidencePathFor(`${other}/${TASK}/a.jpg`, STUDENT, TASK)).toBe(false);
    expect(isEvidencePathFor(`${STUDENT}/${other}/a.jpg`, STUDENT, TASK)).toBe(false);
    expect(isEvidencePathFor(`${evidenceFolder(STUDENT, TASK)}sub/a.jpg`, STUDENT, TASK)).toBe(false);
    expect(isEvidencePathFor(`${evidenceFolder(STUDENT, TASK)}..`, STUDENT, TASK)).toBe(false);
    expect(isEvidencePathFor(evidenceFolder(STUDENT, TASK), STUDENT, TASK)).toBe(false);
  });
});

describe("evidencePath", () => {
  it("uses the mime type's extension, defaulting to jpg", () => {
    expect(evidencePath(STUDENT, TASK, "x", "image/png")).toBe(`${STUDENT}/${TASK}/x.png`);
    expect(evidencePath(STUDENT, TASK, "x", "image/webp")).toBe(`${STUDENT}/${TASK}/x.webp`);
    expect(evidencePath(STUDENT, TASK, "x", "image/heic")).toBe(`${STUDENT}/${TASK}/x.jpg`);
  });
});

describe("isEvidenceMimeType", () => {
  it("accepts the three bucket types only", () => {
    expect(isEvidenceMimeType("image/jpeg")).toBe(true);
    expect(isEvidenceMimeType("application/pdf")).toBe(false);
    expect(isEvidenceMimeType("image/svg+xml")).toBe(false);
  });
});

describe("fitWithin", () => {
  it("scales the longer side down to the max, keeping the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never scales up", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("shouldHoldForEvidenceReview", () => {
  const base = { inApprovalFlow: true, photoCount: 2, status: "done", reviewStatus: "none" };

  it("holds a completed photo-backed task", () => {
    expect(shouldHoldForEvidenceReview(base)).toBe(true);
    expect(shouldHoldForEvidenceReview({ ...base, status: "half_done" })).toBe(true);
    expect(shouldHoldForEvidenceReview({ ...base, reviewStatus: "rejected" })).toBe(true);
    expect(shouldHoldForEvidenceReview({ ...base, reviewStatus: "pending" })).toBe(true);
  });

  it("does not hold without photos, for non-completing statuses, or once approved", () => {
    expect(shouldHoldForEvidenceReview({ ...base, photoCount: 0 })).toBe(false);
    expect(shouldHoldForEvidenceReview({ ...base, status: "not_done" })).toBe(false);
    expect(shouldHoldForEvidenceReview({ ...base, status: "pending" })).toBe(false);
    expect(shouldHoldForEvidenceReview({ ...base, reviewStatus: "approved" })).toBe(false);
  });

  it("leaves a self-created task that is itself awaiting approval to the existing flow", () => {
    expect(shouldHoldForEvidenceReview({ ...base, inApprovalFlow: false })).toBe(false);
  });
});

describe("evidenceOutcome", () => {
  const paths = ["a", "b", "c"];

  it("is approved only when every photo is approved", () => {
    expect(evidenceOutcome(paths, { a: "approved", b: "approved", c: "approved" })).toBe("approved");
  });

  it("sends the task back as soon as ANY photo is rejected, even with others undecided", () => {
    expect(evidenceOutcome(paths, { a: "approved", b: "rejected", c: "approved" })).toBe("rejected");
    expect(evidenceOutcome(paths, { b: "rejected" })).toBe("rejected");
  });

  it("stays pending while a photo has no verdict and none is rejected", () => {
    expect(evidenceOutcome(paths, { a: "approved", b: "approved" })).toBe("pending");
    expect(evidenceOutcome(paths, {})).toBe("pending");
  });

  it("is pending for a task with no photos", () => {
    expect(evidenceOutcome([], {})).toBe("pending");
  });

  it("ignores verdicts for photos the task no longer has", () => {
    expect(evidenceOutcome(["a"], { a: "approved", gone: "rejected" })).toBe("approved");
  });
});

describe("photo status helpers", () => {
  it("normalizePhotoStatus keeps only known verdicts", () => {
    expect(normalizePhotoStatus({ a: "approved", b: "rejected", c: "maybe", d: 1 })).toEqual({ a: "approved", b: "rejected" });
    expect(normalizePhotoStatus(null)).toEqual({});
    expect(normalizePhotoStatus(["a"])).toEqual({});
  });

  it("withoutRejected clears rejected verdicts and keeps approved ones", () => {
    expect(withoutRejected({ a: "approved", b: "rejected" })).toEqual({ a: "approved" });
  });

  it("withoutPath drops one photo's verdict", () => {
    expect(withoutPath({ a: "approved", b: "rejected" }, "b")).toEqual({ a: "approved" });
  });

  it("applyPhotoDecisions merges verdicts, drops stale paths and ignores unknown ones", () => {
    expect(
      applyPhotoDecisions(["a", "b"], { a: "approved", stale: "rejected" }, [
        { path: "b", decision: "rejected" },
        { path: "nope", decision: "approved" },
      ]),
    ).toEqual({ a: "approved", b: "rejected" });
  });
});

describe("duplicate photo guard", () => {
  const photo = (name: string, size: number, lastModified: number) => ({ name, size, lastModified });

  it("recognises the same file by name, size and last-modified time", () => {
    expect(evidenceFileSignature(photo("IMG_1.jpg", 2048, 111))).toBe("IMG_1.jpg|2048|111");
  });

  it("refuses a file that is already on the task", () => {
    const known = [evidenceFileSignature(photo("IMG_1.jpg", 2048, 111))];
    const { fresh, duplicates } = splitDuplicateFiles([photo("IMG_1.jpg", 2048, 111), photo("IMG_2.jpg", 4096, 222)], known);
    expect(duplicates).toBe(1);
    expect(fresh.map((f) => f.file.name)).toEqual(["IMG_2.jpg"]);
  });

  it("refuses the same file picked twice in one selection but keeps the first", () => {
    const { fresh, duplicates } = splitDuplicateFiles([photo("a.jpg", 1, 1), photo("a.jpg", 1, 1), photo("b.jpg", 1, 1)], []);
    expect(duplicates).toBe(1);
    expect(fresh).toHaveLength(2);
  });

  it("treats a file with a different size or time as a different photo", () => {
    const known = [evidenceFileSignature(photo("a.jpg", 1, 1))];
    expect(splitDuplicateFiles([photo("a.jpg", 2, 1), photo("a.jpg", 1, 2)], known).duplicates).toBe(0);
  });
});
