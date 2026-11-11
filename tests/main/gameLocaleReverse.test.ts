import { afterEach, describe, expect, it } from "vitest";

import {
  __resetReverseCacheForTest,
  localizedToEnglishItemName,
  setGameLocale,
} from "../../services/gameLocale";

// Reverse resolution reads src/data/itemNames/{tr,en}.json from disk (cwd).
afterEach(() => {
  setGameLocale("en");
  __resetReverseCacheForTest();
});

describe("localizedToEnglishItemName", () => {
  it("resolves a direct Turkish part name to canonical English", () => {
    setGameLocale("tr");
    expect(localizedToEnglishItemName("Akjagara Prime Sürgü")).toBe("Akjagara Prime Receiver");
    expect(localizedToEnglishItemName("Epitaph Prime Sürgü")).toBe("Epitaph Prime Receiver");
    expect(localizedToEnglishItemName("Epitaph Prime Namlu")).toBe("Epitaph Prime Barrel");
  });

  it("peels a localized blueprint suffix and appends English Blueprint", () => {
    setGameLocale("tr");
    // "Kalıp" is the Turkish BlueprintAndItem wrapper.
    expect(localizedToEnglishItemName("Gauss Prime Sistemleri Kalıp")).toBe(
      "Gauss Prime Systems Blueprint",
    );
    expect(localizedToEnglishItemName("Gauss Prime Gövde Kalıp")).toBe(
      "Gauss Prime Chassis Blueprint",
    );
  });

  it("is case-insensitive", () => {
    setGameLocale("tr");
    expect(localizedToEnglishItemName("akjagara prime sürgü")).toBe("Akjagara Prime Receiver");
  });

  it("returns null for an unknown name", () => {
    setGameLocale("tr");
    expect(localizedToEnglishItemName("Totally Not A Real Item")).toBeNull();
  });

  it("is a no-op in English (canonical already)", () => {
    setGameLocale("en");
    expect(localizedToEnglishItemName("Akjagara Prime Receiver")).toBeNull();
  });

  it("ignores empty input", () => {
    setGameLocale("tr");
    expect(localizedToEnglishItemName("")).toBeNull();
    expect(localizedToEnglishItemName(null)).toBeNull();
  });
});
