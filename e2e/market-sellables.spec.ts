import { expect, test } from "@playwright/test";

import {
  closeElectronTestHarness,
  launchElectronTestHarness,
  type ElectronTestHarness,
} from "./electronTestHarness";

const BRATON_PRIME_BARREL = "/Lotus/Types/Recipes/Weapons/WeaponParts/BratonPrimeBarrel";
const BRATON_PRIME_STOCK = "/Lotus/Types/Recipes/Weapons/WeaponParts/BratonPrimeStock";

test.describe("Market sellables tab", () => {
  test.setTimeout(180_000);

  let harness: ElectronTestHarness | undefined;

  test.beforeAll(async () => {
    harness = await launchElectronTestHarness("wfh-sellables-", {
      inventory: {
        Suits: [],
        // The stock's single copy is the hide-singles fixture: the barrel is a spare.
        MiscItems: [
          { ItemType: BRATON_PRIME_BARREL, ItemCount: 2 },
          { ItemType: BRATON_PRIME_STOCK, ItemCount: 1 },
        ],
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

  test("the hide-singles checkbox drops single copies and lifts back off", async () => {
    const page = harness!.page;
    const checkbox = page.locator("[data-sellables-hide-singles]");
    const barrel = page.locator(`[data-inventory-card^="${BRATON_PRIME_BARREL}"]`).first();
    const stock = page.locator(`[data-inventory-card^="${BRATON_PRIME_STOCK}"]`).first();

    // Off by default: both the spare barrel and the single stock show.
    await expect(checkbox).not.toBeChecked();
    await expect(barrel).toBeVisible({ timeout: 15_000 });
    await expect(stock).toBeVisible();

    // On: the only-copy stock leaves, the twice-owned barrel stays.
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(stock).toHaveCount(0);
    await expect(barrel).toBeVisible();

    // Off again so the persisted preference never bleeds into later runs.
    await checkbox.click();
    await expect(stock).toBeVisible({ timeout: 15_000 });
  });
});
