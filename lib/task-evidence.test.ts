import { describe, expect, it } from "vitest";
import {
  evidenceFolder,
  evidencePath,
  fitWithin,
  isEvidenceMimeType,
  isEvidencePathFor,
  shouldHoldForEvidenceReview,
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
