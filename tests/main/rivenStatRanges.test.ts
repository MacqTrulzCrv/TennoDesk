import { describe, expect, it } from "vitest";

import { getRivenStatRanges } from "../../services/rivenGrading";

describe("riven stat ranges", () => {
  it("matches browse.wf for Astilla Prime at 3 buff / 1 curse", () => {
    const ranges = getRivenStatRanges("Astilla Prime", 3, 1);
    expect(ranges).toBeTruthy();
    expect(ranges?.disposition).toBeCloseTo(1.2, 5);

    const damage = ranges?.stats.find((s) => s.tag === "WeaponDamageAmountMod");
    expect(damage?.unit).toBe("percent");
    expect(damage?.buff?.atMin).toBeCloseTo(166.8, 0);
    expect(damage?.buff?.atMax).toBeCloseTo(203.8, 0);
    expect(damage?.curse?.atMin).toBeCloseTo(-133.4, 0);
    expect(damage?.curse?.atMax).toBeCloseTo(-163.1, 0);

    // Punch Through is metres, not a percent.
    const punch = ranges?.stats.find((s) => s.tag === "WeaponPunctureDepthMod");
    expect(punch?.unit).toBe("meters");
    expect(punch?.buff?.atMax).toBeCloseTo(3.3, 1);

    // Faction damage is a multiplier: buff x(1+v), curse x(1-v).
    const faction = ranges?.stats.find((s) => s.tag === "WeaponFactionDamageCorpus");
    expect(faction?.unit).toBe("multiplier");
    expect(faction?.buff?.atMax).toBeCloseTo(1.56, 1);
    expect(faction?.curse?.atMax).toBeCloseTo(0.55, 1); // the user's scan read x0.56
  });

  it("drops the curse column when the config has no curse", () => {
    const ranges = getRivenStatRanges("Astilla Prime", 2, 0);
    expect(ranges?.stats.every((s) => s.curse === null)).toBe(true);
    // A curse boosts the buffs (x1.25), so 3/0 rolls weaker buffs than 3/1.
    const noCurse = getRivenStatRanges("Astilla Prime", 3, 0)?.stats.find(
      (s) => s.tag === "WeaponDamageAmountMod",
    );
    const withCurse = getRivenStatRanges("Astilla Prime", 3, 1)?.stats.find(
      (s) => s.tag === "WeaponDamageAmountMod",
    );
    expect(noCurse!.buff!.atMax).toBeLessThan(withCurse!.buff!.atMax);
  });

  it("returns null for a weapon with no riven type", () => {
    expect(getRivenStatRanges("Not A Real Weapon 9000")).toBeNull();
  });
});
