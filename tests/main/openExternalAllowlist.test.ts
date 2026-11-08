import { describe, expect, it } from "vitest";
import { isAllowedExternalHost } from "../../config/runtime/security";

// Every external host the app still opens; a miss here means a silently dead
// button. The original author's Discord/Patreon/wfhelper.com links were
// stripped in the TennoDesk fork, so they must NOT be allowed anymore.
const ALLOWED_HOSTS = [
  "warframe.market",
  "github.com",
  "browse.wf",
  "svesk.github.io",
  "arbi.guide",
];

describe("open-external allowlist", () => {
  it("allows every host the app still links to", () => {
    const blocked = ALLOWED_HOSTS.filter((host) => !isAllowedExternalHost(host));
    expect(blocked).toEqual([]);
  });

  it("no longer allows the original author's community/funding hosts", () => {
    expect(isAllowedExternalHost("wfhelper.com")).toBe(false);
    expect(isAllowedExternalHost("www.wfhelper.com")).toBe(false);
    expect(isAllowedExternalHost("discord.gg")).toBe(false);
    expect(isAllowedExternalHost("patreon.com")).toBe(false);
    expect(isAllowedExternalHost("www.patreon.com")).toBe(false);
  });

  it("is case-insensitive and trims", () => {
    expect(isAllowedExternalHost(" Warframe.Market ")).toBe(true);
  });

  it("rejects unknown and lookalike hosts", () => {
    expect(isAllowedExternalHost("www.warframe.com")).toBe(true);
    expect(isAllowedExternalHost("www.warframe.com.evil.com")).toBe(false);
    expect(isAllowedExternalHost("evil.com")).toBe(false);
    expect(isAllowedExternalHost("warframe.market.evil.com")).toBe(false);
    expect(isAllowedExternalHost("")).toBe(false);
  });
});
