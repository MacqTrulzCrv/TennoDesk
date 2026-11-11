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

  it("reads a stat trailed by a qualifier and a multi-word faction label", () => {
    setGameLocale("tr");
    // Real OCR: "Kritik Şans (Ağır Saldırılar için x2)" and "Corpus'a Hasar verir".
    const ocr = "%+172,8 Kritik Sans (Agir Saldirilar icin x2)\n%+90,1 Corpus'a Hasar verir";
    const english = localizeRivenOcrText(ocr).toLowerCase();
    expect(english).toContain("critical chance");
    expect(english).toContain("damage to corpus");
    // The value and qualifier are preserved for the English parser.
    expect(localizeRivenOcrText(ocr)).toContain("(Agir Saldirilar icin x2)");
  });

  it("leaves English OCR text untouched", () => {
    setGameLocale("en");
    const ocr = "+132.3% Multishot\n+187.1% Critical Chance";
    expect(localizeRivenOcrText(ocr)).toBe(ocr);
  });
});
