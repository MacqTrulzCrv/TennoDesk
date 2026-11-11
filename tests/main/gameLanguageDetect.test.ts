import { describe, expect, it } from "vitest";

import { parseGameLanguage } from "../../services/eeLogMonitor";

describe("parseGameLanguage", () => {
  it("reads the 'Using language: _xx' line", () => {
    expect(parseGameLanguage("3.935 Sys [Info]: Using language: _tr")).toBe("tr");
    expect(parseGameLanguage("3.935 Sys [Info]: Using language: _en")).toBe("en");
  });

  it("reads the language flag off the process command line", () => {
    expect(
      parseGameLanguage(
        "0.151 Sys [Diag]: Process Command-line: -windowMode:2 -cluster:public -language:tr -clienttype:Steam",
      ),
    ).toBe("tr");
  });

  it("returns null for unrelated lines", () => {
    expect(parseGameLanguage("9.024 Sys [Info]: Resource load completed")).toBeNull();
    expect(parseGameLanguage("")).toBeNull();
  });
});
