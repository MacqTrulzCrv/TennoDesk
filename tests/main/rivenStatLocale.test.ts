import { afterEach, describe, expect, it } from "vitest";

import { setGameLocale } from "../../services/gameLocale";
import {
  getLocalizedStatDisplay,
  getStatDisplayName,
  localizeRivenOcrText,
  statNameToTag,
} from "../../services/rivenData";
import { parseRivenStats } from "../../ipc/overlay/rivenScanText";

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

  it("matches diacritic-stripped OCR text to the right stat tag", () => {
    setGameLocale("tr");
    // What PaddleOCR actually produced for a Turkish riven card (accents dropped).
    expect(statNameToTag("Coklu Atis")).toBe("WeaponFireIterationsMod");
    expect(statNameToTag("Kritik Sans")).toBe("WeaponCritChanceMod");
    expect(statNameToTag("Kritik Hasar")).toBe("WeaponCritDamageMod");
    expect(statNameToTag("Statu Sansi")).toBe("WeaponStunChanceMod");
  });

  it("still matches canonical English names in any locale", () => {
    setGameLocale("tr");
    expect(statNameToTag("Critical Chance")).toBe("WeaponCritChanceMod");
  });

  it("translates a real Turkish riven OCR scan into parseable English stats", () => {
    setGameLocale("tr");
    // The exact text PaddleOCR produced for a Furis Critacan riven card.
    const ocr = "%+132,3 Coklu Atis\n%+187,1 Kritik Sans";
    const english = localizeRivenOcrText(ocr);
    expect(english).toContain("Multishot");
    expect(english).toContain("Critical Chance");

    const names = parseRivenStats(english).map((s) => s.name.toLowerCase());
    expect(names).toContain("multishot");
    expect(names).toContain("critical chance");
  });

  it("tolerates the dotless-i read as l/i and leading punctuation noise", () => {
    setGameLocale("tr");
    // Real OCR from an Arca Titron card: "Statü Şansı" -> "Statu Sansl",
    // "Saldırı Hızı" -> "Saldiri Hizl", and a stray "(" before "Kesme" (Slash).
    const ocr = "%+164,9 ( Kesme\n%+142,8 Statu Sansl\n%-33,4 Saldiri Hizl";
    const english = localizeRivenOcrText(ocr);
    expect(english).toContain("Slash");
    expect(english).toContain("Status Chance");
    expect(english).toContain("Fire Rate");
  });

  it("reads a stat whose display-only qualifier wraps onto its own line", () => {
    setGameLocale("tr");
    // Real Balla OCR: the "(Ağır Saldırılar için x2)" qualifier wrapped, and its
    // stray "x2" used to be read as the next stat's value (79.8 -> 2).
    const ocr =
      "%+112,1 Darbe\n%+172,8 Kritik Sans (Agir\nSaldirilar icin x2)\n%+79,8 Kritik Hasar";
    const stats = parseRivenStats(localizeRivenOcrText(ocr));
    const byName = new Map(stats.map((s) => [s.name.toLowerCase(), s.value]));
    expect(byName.get("impact")).toBeCloseTo(112.1, 0);
    expect(byName.get("critical chance")).toBeCloseTo(172.8, 0);
    expect(byName.get("critical damage")).toBeCloseTo(79.8, 0);
  });

  it("reads a multi-word faction label", () => {
    setGameLocale("tr");
    expect(localizeRivenOcrText("x1,9 Corpus'a Hasar verir").toLowerCase()).toContain(
      "damage to corpus",
    );
  });

  it("leaves English OCR text untouched", () => {
    setGameLocale("en");
    const ocr = "+132.3% Multishot\n+187.1% Critical Chance";
    expect(localizeRivenOcrText(ocr)).toBe(ocr);
  });
});
