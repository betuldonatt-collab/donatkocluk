import { describe, expect, it } from "vitest";
import {
  STILL_STUDYING_INTERVAL_SECONDS as HOUR3,
  confirmationMultiple,
  isConfirmationDue,
} from "./focus-confirmation";

describe("confirmationMultiple", () => {
  it("is 0 until the first 3 hours are complete", () => {
    expect(confirmationMultiple(0)).toBe(0);
    expect(confirmationMultiple(HOUR3 - 1)).toBe(0);
  });

  it("steps up at every full 3 hours", () => {
    expect(confirmationMultiple(HOUR3)).toBe(1);
    expect(confirmationMultiple(2 * HOUR3 + 5)).toBe(2);
  });

  it("ignores negative input", () => {
    expect(confirmationMultiple(-50)).toBe(0);
  });
});

describe("isConfirmationDue", () => {
  it("never asks before 3 hours", () => {
    expect(isConfirmationDue(HOUR3 - 1, 0)).toBe(false);
  });

  it("asks once the 3-hour mark is crossed and is unconfirmed", () => {
    expect(isConfirmationDue(HOUR3, 0)).toBe(true);
    expect(isConfirmationDue(HOUR3 + 600, 0)).toBe(true);
  });

  it("stops asking after the student confirms, until the next 3-hour mark", () => {
    expect(isConfirmationDue(HOUR3 + 600, 1)).toBe(false);
    expect(isConfirmationDue(2 * HOUR3, 1)).toBe(true);
  });

  it("asks once (not repeatedly) when several marks were crossed while away", () => {
    // Returned after 9h having confirmed nothing: one prompt, confirming
    // sets the multiple to 3 so it doesn't ask for 6h and 3h again.
    expect(isConfirmationDue(3 * HOUR3 + 10, 0)).toBe(true);
    expect(isConfirmationDue(3 * HOUR3 + 10, confirmationMultiple(3 * HOUR3 + 10))).toBe(false);
  });
});
