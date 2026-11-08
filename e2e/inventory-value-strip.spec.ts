import { test, expect } from "@playwright/test";

import {
  closeElectronTestHarness,
  launchElectronTestHarness,
  type ElectronTestHarness,
} from "./electronTestHarness";

const ACCELERATED_ISOTOPE = "/Lotus/Upgrades/Mods/Pistol/DualStat/RadiationFireratePistolMod";
const BRATON_PRIME_BARREL = "/Lotus/Types/Recipes/Weapons/WeaponParts/BratonPrimeBarrel";

function inventory() {
  return {
    Suits: [],
    RawUpgrades: [{ ItemType: ACCELERATED_ISOTOPE, ItemCount: 23 }],
    MiscItems: [{ ItemType: BRATON_PRIME_BARREL, ItemCount: 2 }],
  };
}

test.describe("Inventory value strip controls", () => {
  test.setTimeout(180_000);

  let harness: ElectronTestHarness | undefined;

  test.beforeAll(async () => {
    harness = await launchElectronTestHarness("wfh-valuestrip-", { inventory: inventory() });
    // The report came in under the Turkish locale, so the checks run there too.
    await harness.page.evaluate(() => localStorage.setItem("app-language", "tr"));
    await harness.page.reload();
    await expect(harness.page.locator("#sidebar")).toBeVisible({ timeout: 90_000 });
    await harness.page.locator('#sidebar [data-view="inventory"]').click();
    await expect(harness.page.locator("[data-inventory-value-strip]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test.afterAll(async () => {
    await closeElectronTestHarness(harness);
  });

  test("the prime lens narrows a prime-bearing tab and all-tradables lifts it", async () => {
    const page = harness!.page;
    const prime = page.locator('[data-value-scope-option="prime"]');
    const tradable = page.locator('[data-value-scope-option="tradable"]');

    // All-tradables is the default, so every tab opens on its full stock.
    await expect(tradable).toHaveAttribute("aria-pressed", "true");
    await expect(prime).toHaveAttribute("aria-pressed", "false");

    // The Everything tab carries a prime part next to the mod, so the lens applies.
    await page.locator('[data-tour-tab="everything"]').click();
    // Mod rows are rank-split, so the card id can carry a suffix.
    const modCard = page.locator(`[data-inventory-card^="${ACCELERATED_ISOTOPE}"]`).first();
    await expect(prime).toBeEnabled();
    await expect(modCard).toBeVisible({ timeout: 15_000 });

    // Dropping to prime-only hides the non-prime mod but keeps the prime part.
    await prime.click();
    await expect(prime).toHaveAttribute("aria-pressed", "true");
    await expect(tradable).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-tour-tab="everything"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(modCard).toHaveCount(0);
    await expect(
      page.locator(".item-name").filter({ hasText: "Braton Prime" }).first(),
    ).toBeVisible();

    // Lifting the lens brings the mod back, and the tab never moved.
    await tradable.click();
    await expect(modCard).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-tour-tab="all_parts"]').click();
  });

  test("the tab row switches between All Parts and Full Sets", async () => {
    const page = harness!.page;
    await page.locator('[data-tour-tab="all_parts"]').click();
    await expect(page.locator('[data-tour-tab="all_parts"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    // Under the Turkish locale item names localize too ("Namlu" for Barrel),
    // so the assertion anchors on the untranslated weapon name only.
    await expect(
      page.locator(".item-name").filter({ hasText: "Braton Prime" }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-tour-tab="full_sets"]').click();
    await expect(page.locator('[data-tour-tab="full_sets"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.locator('[data-tour-tab="all_parts"]').click();
  });

  // Last on purpose: with this tiny fixture a platinum floor can zero both
  // totals, at which point the strip (and its own controls) unmounts.
  test("a minimum-platinum preset either activates or empties the strip away", async () => {
    const page = harness!.page;
    const off = page.locator('[data-value-min-plat-option="0"]');
    const second = page.locator("[data-value-min-plat-option]").nth(1);

    await expect(off).toHaveAttribute("aria-pressed", "true");
    await second.click();
    await expect
      .poll(async () => {
        if ((await page.locator("[data-inventory-value-strip]").count()) === 0) return "hidden";
        return (await second.getAttribute("aria-pressed")) === "true" ? "active" : "pending";
      })
      .not.toBe("pending");
  });
});
