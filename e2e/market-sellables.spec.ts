import { expect, test } from "@playwright/test";

import {
  closeElectronTestHarness,
  launchElectronTestHarness,
  type ElectronTestHarness,
} from "./electronTestHarness";

const BRATON_PRIME_BARREL = "/Lotus/Types/Recipes/Weapons/WeaponParts/BratonPrimeBarrel";

test.describe("Market sellables tab", () => {
  test.setTimeout(180_000);

  let harness: ElectronTestHarness | undefined;

  test.beforeAll(async () => {
    harness = await launchElectronTestHarness("wfh-sellables-", {
      inventory: {
        Suits: [],
        MiscItems: [{ ItemType: BRATON_PRIME_BARREL, ItemCount: 2 }],
      },
    });
    await harness.page.locator('#sidebar [data-view="market"]').click();
    await harness.page.locator('[data-tour-tab="sellables"]').click();
    await expect(harness.page.locator("[data-market-sellables]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test.afterAll(async () => {
    await closeElectronTestHarness(harness);
  });

  test("a card click opens the order book / sell panel, like the Inventory tab", async () => {
    const page = harness!.page;
    const card = page.locator(`[data-inventory-card^="${BRATON_PRIME_BARREL}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    // The sell panel is the live buy/sell board on the right, not a read-only modal.
    await expect(page.locator("[data-orderbook-panel]")).toBeVisible({ timeout: 30_000 });
    await page.locator("[data-orderbook-close]").click();
    await expect(page.locator("[data-orderbook-panel]")).toHaveCount(0);
  });

  test("the category chips and sort control are present", async () => {
    const page = harness!.page;
    await expect(page.locator('[data-sellables-category="prime"]')).toBeVisible();
    await expect(page.locator("[data-sellables-sort]")).toBeVisible();
  });
});
