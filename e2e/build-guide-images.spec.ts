import { expect, test } from "@playwright/test";

import {
  closeElectronTestHarness,
  launchElectronTestHarness,
  type ElectronTestHarness,
} from "./electronTestHarness";

// Every guide entry should resolve art from the item database; a placeholder
// on the Meta showcase means a name mismatch or a db row without imageUrl.
test.describe("Build guide item art", () => {
  test.setTimeout(180_000);

  let harness: ElectronTestHarness | undefined;

  test.beforeAll(async () => {
    harness = await launchElectronTestHarness("wfh-build-art-", {
      inventory: { Suits: [], MiscItems: [] },
    });
    await harness.page.locator('#sidebar [data-view="builds"]').click();
    await expect(harness.page.locator("[data-builds-overview]")).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await closeElectronTestHarness(harness);
  });

  test("every Meta showcase tile renders real art, not the placeholder", async () => {
    const page = harness!.page;
    await expect(page.locator("[data-builds-featured]").first()).toBeVisible({ timeout: 15_000 });

    // The db streams in after first paint; poll until no tile is a placeholder
    // or the list of offenders stops shrinking.
    const missing = async (): Promise<string[]> =>
      page.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll<HTMLElement>("[data-builds-featured]"));
        return tiles
          .filter((tile) => !tile.querySelector("img"))
          .map((tile) => tile.getAttribute("data-builds-featured") ?? "?");
      });

    await expect.poll(missing, { timeout: 60_000, intervals: [1_000, 2_000, 5_000] }).toEqual([]);
  });
});
