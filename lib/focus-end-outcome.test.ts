import { describe, expect, it } from "vitest";

import { describeEndOutcome, SHORTFALL_WARNING_SECONDS } from "./focus-end-outcome";

const base = { clientSeconds: 2520, bankedSeconds: 2520, hadSession: true, pendingApproval: false, goalHit: false };

describe("describeEndOutcome", () => {
  it("reports what the server banked when it matches the student's timer", () => {
    const out = describeEndOutcome(base);
    expect(out?.tone).toBe("success");
    expect(out?.text).toContain("42:00");
    expect(out?.text).toContain("göreve kaydedildi");
  });

  it("ignores a small gap (rounding / latency)", () => {
    const out = describeEndOutcome({ ...base, bankedSeconds: 2520 - (SHORTFALL_WARNING_SECONDS - 1) });
    expect(out?.tone).toBe("success");
  });

  it("explains a big shortfall (42 on the clock, 13 saved) and says why", () => {
    const out = describeEndOutcome({ ...base, bankedSeconds: 13 * 60 });
    expect(out?.tone).toBe("warning");
    expect(out?.text).toContain("42:00");
    expect(out?.text).toContain("13:00");
    expect(out?.text).toContain("ekranı kilitlemen");
    expect(out?.text).toContain("sunucuya geç ulaştı");
    expect(out?.text).toContain("açık tut");
  });

  it("a session the server no longer has is explained, not reported as saved", () => {
    const out = describeEndOutcome({ ...base, hadSession: false, bankedSeconds: 0 });
    expect(out?.tone).toBe("warning");
    expect(out?.text).toContain("sunucuda bulunamadı");
    expect(out?.text).toContain("başka bir cihazdan");
  });

  it("says nothing for a trivially short session that was never on the server", () => {
    expect(describeEndOutcome({ ...base, clientSeconds: 10, hadSession: false, bankedSeconds: 0 })).toBeNull();
  });

  it("after a timed-out first attempt, an already-gone session means it most likely went through", () => {
    const out = describeEndOutcome({ ...base, hadSession: false, bankedSeconds: 0, uncertain: true });
    expect(out).toEqual({ tone: "success", text: "Süren kaydedildi." });
  });

  it("a session parked for coach approval says so", () => {
    const out = describeEndOutcome({ ...base, clientSeconds: 7 * 3600, bankedSeconds: 7 * 3600, pendingApproval: true });
    expect(out?.tone).toBe("warning");
    expect(out?.text).toContain("koç onayına");
  });

  it("nothing to say for a zero-second session that did exist", () => {
    expect(describeEndOutcome({ ...base, clientSeconds: 0, bankedSeconds: 0 })).toBeNull();
  });
});
