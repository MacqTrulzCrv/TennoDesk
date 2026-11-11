import { afterEach, describe, expect, it } from "vitest";

import { setGameLocale } from "../../services/gameLocale";
import { getLocalizedStatDisplay, getStatDisplayName } from "../../services/rivenData";

afterEach(() => {
  setGameLocale("en");
});

describe("riven stat localization", () => {
  it("shows Turkish stat names when the game language is Turkish", () => {
    setGameLocale("tr");
    expect(getStatDisplayName("WeaponCritDamageMod")).toBe("Kritik Hasar");
    expect(getStatDisplayName("WeaponFireIterationsMod")).toBe("Çoklu Atış");
    expect(getStatDisplayName("WeaponStunChanceMod")).toBe("Statü Şansı");
    expect(getStatDisplayName("WeaponArmorPiercingDamageMod")).toBe("Delme");
  });

  it("localizes the melee attack-speed label", () => {
    setGameLocale("tr");
    expect(getStatDisplayName("WeaponFireRateMod", true)).toBe("Saldırı Hızı");
  });

  it("keeps a word boundary where the value placeholder sat", () => {
    setGameLocale("tr");
    // The Turkish label writes the placeholder between words: "Corpus'a |val| Hasar verir".
    expect(getStatDisplayName("WeaponFactionDamageCorpus")).toBe("Corpus'a Hasar verir");
  });

  it("stays English (canonical) in English", () => {
    setGameLocale("en");
    expect(getStatDisplayName("WeaponCritDamageMod")).toBe("Critical Damage");
    expect(getLocalizedStatDisplay("WeaponCritDamageMod")).toBeNull();
  });
});
