import { describe, expect, it } from "vitest";
import { clock, dayLabel, metres } from "./format";

describe("format", () => {
  it("reads the rig's wall clock straight off an offset timestamp", () => {
    expect(clock("2026-10-02T23:41:07+05:30")).toBe("23:41:07");
  });

  it("writes a report date the way the rig does", () => {
    expect(dayLabel("2018-02-03")).toBe("3 Feb 2018");
    expect(dayLabel("2019-12-31T06:00:00+05:30")).toBe("31 Dec 2019");
  });

  it("groups thousands and keeps the asked decimals", () => {
    expect(metres(2872)).toBe("2,872");
    expect(metres(2872.46, 1)).toBe("2,872.5");
  });
});
