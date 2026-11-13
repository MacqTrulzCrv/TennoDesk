import { test, expect } from "@playwright/test";

import {
  closeElectronTestHarness,
  launchElectronTestHarness,
  openView,
  type ElectronTestHarness,
} from "./electronTestHarness";

// Reproduces the report: in Riven Finder nothing appears when typing a weapon.
// Weapon names are always English (readPepDict("en")), so this holds in any UI
// language; the second test seeds Turkish to mirror the user's setup exactly.
test.describe("Riven Finder weapon search", () => {
  test.setTimeout(180_000);

  let harness: ElectronTestHarness | undefined;

  test.afterEach(async () => {
    await closeElectronTestHarness(harness);
    harness = undefined;
  });

  async function openFinder(appLanguage?: string) {
    harness = await launchElectronTestHarness("wfh-riven-finder-", {
      inventory: { Suits: [] },
      ...(appLanguage ? { storage: { "app-language": appLanguage } } : {}),
    });
    await openView(harness.page, "rivens");
    await harness.page.locator('[data-tour-tab="finder"]').click();
    return harness.page;
  }

  test("delivers weapon names over IPC and lists matches as you type", async () => {
    const page = await openFinder();

    const ipc = await page.evaluate(async () => {
      try {
        const api = (window as unknown as { api: Record<string, (...a: unknown[]) => unknown> })
          .api;
        const names = await api.getRivenWeaponNames();
        const stats = await api.getRivenStatOptions();
        return {
          ok: true,
          names: Array.isArray(names) ? names.length : -1,
          stats: Array.isArray(stats) ? stats.length : -1,
          sample: Array.isArray(names) ? names.slice(0, 3) : [],
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });
    console.log("[riven-finder e2e] IPC result:", JSON.stringify(ipc));
    expect(ipc.ok, `IPC threw: ${ipc.error ?? ""}`).toBe(true);
    expect(ipc.names).toBeGreaterThan(100);

    const input = page.getByPlaceholder("Type weapon name...");
    await input.click();
    await input.pressSequentially("soma", { delay: 40 });

    const dropdownButtons = page.locator("div.absolute.top-full button");
    await expect(dropdownButtons.first()).toBeVisible({ timeout: 8_000 });
    const count = await dropdownButtons.count();
    console.log("[riven-finder e2e] dropdown button count:", count);
    expect(count).toBeGreaterThan(0);
  });

  test("a search returns live auctions for a popular weapon", async () => {
    const page = await openFinder();

    const input = page.getByPlaceholder("Type weapon name...");
    await input.click();
    await input.pressSequentially("Boltor", { delay: 40 });
    await page
      .locator("div.absolute.top-full button", { hasText: /^Boltor$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Search WFM" }).click();

    const openButtons = page.locator("button", { hasText: /Open on WFM/i });
    await expect(openButtons.first()).toBeVisible({ timeout: 30_000 });
    const count = await openButtons.count();
    console.log(`[riven-finder e2e] live search result cards=${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test("works the same with a Turkish UI", async () => {
    const page = await openFinder("tr");

    // Placeholder is translated; the weapon input carries the search-focus marker.
    const input = page.locator("input[data-search-focus]").first();
    await input.click();
    await input.pressSequentially("Boltor", { delay: 40 });

    const dropdownButtons = page.locator("div.absolute.top-full button");
    await expect(dropdownButtons.first()).toBeVisible({ timeout: 8_000 });
    expect(await dropdownButtons.count()).toBeGreaterThan(0);
  });
});
