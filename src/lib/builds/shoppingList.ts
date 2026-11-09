// Aggregates the mods/arcanes you still need across the build guides, so the
// shopping list can show one de-duplicated "go buy these" set with WTB links.
import { BUILD_GUIDES, BUILD_MOD_META, type BuildGuideItem } from "../../data/buildGuides.js";
import type { ParsedItem } from "../../types/inventory.js";

type BuildGuide = BuildGuideItem["builds"][number];
type ModRarity = "Common" | "Uncommon" | "Rare" | "Legendary";

/**
 * "mine" = builds for gear you own, plus any build you pinned.
 * "pinned" = only pinned builds. "all" = every build in the guide.
 */
export type ShoppingScope = "mine" | "pinned" | "all";

// Equipment categories the guide covers; matched against ParsedItem.categoryLabel.
const EQUIP_CATEGORY = /^(warframe|primary|secondary|melee)$/;

/** English names of the warframes/weapons the account currently owns. */
export function ownedEquipmentNames(items: readonly ParsedItem[]): Set<string> {
  const names = new Set<string>();
  for (const item of items) {
    if (item.currentlyOwned === false) continue;
    if (EQUIP_CATEGORY.test(item.categoryLabel.toLowerCase())) names.add(item.name);
  }
  return names;
}

/** English mod/arcane name -> owned copies (mirrors the build guide's own check). */
export function buildOwnedModIndex(items: readonly ParsedItem[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const item of items) {
    if (item.category !== "mods" && item.category !== "arcanes") continue;
    if (item.currentlyOwned === false) continue;
    index.set(item.name, (index.get(item.name) ?? 0) + (item.combinedAmount ?? item.amount ?? 1));
  }
  return index;
}

/** Every mod-like name a build asks you to own (slots + arcanes + aura/exilus/stance). */
function buildWants(build: BuildGuide): string[] {
  const out = [...build.mods, ...build.arcanes];
  if (build.aura) out.push(build.aura);
  if (build.exilus) out.push(build.exilus);
  if (build.stance) out.push(build.stance);
  return out;
}

export interface ScopedBuilds {
  entry: BuildGuideItem;
  builds: BuildGuide[];
}

/** The guide items (and their relevant builds) that fall into the chosen scope. */
export function itemsInScope(
  scope: ShoppingScope,
  ownedEquip: ReadonlySet<string>,
  pinnedBuildIds: ReadonlySet<string>,
): ScopedBuilds[] {
  const out: ScopedBuilds[] = [];
  for (const entry of BUILD_GUIDES.items) {
    let builds: BuildGuide[];
    if (scope === "all") {
      builds = entry.builds;
    } else if (scope === "pinned") {
      builds = entry.builds.filter((build) => pinnedBuildIds.has(build.id));
    } else {
      // "mine": owning the gear pulls in all its builds; otherwise only pins.
      builds = ownedEquip.has(entry.item)
        ? entry.builds
        : entry.builds.filter((build) => pinnedBuildIds.has(build.id));
    }
    if (builds.length > 0) out.push({ entry, builds });
  }
  return out;
}

export interface ShoppingItem {
  name: string;
  rarity: ModRarity | null;
  /** Item (frame/weapon) names whose builds still need it. */
  fromItems: string[];
  /** How many distinct builds need it. */
  buildCount: number;
}

/** De-duplicated list of mods/arcanes still missing across the scoped builds. */
export function aggregateMissing(
  scopeItems: readonly ScopedBuilds[],
  ownedMods: ReadonlyMap<string, number>,
): ShoppingItem[] {
  const map = new Map<
    string,
    { rarity: ModRarity | null; items: Set<string>; builds: Set<string> }
  >();
  for (const { entry, builds } of scopeItems) {
    for (const build of builds) {
      for (const name of buildWants(build)) {
        if ((ownedMods.get(name) ?? 0) > 0) continue;
        let agg = map.get(name);
        if (!agg) {
          agg = {
            rarity: BUILD_MOD_META[name]?.rarity ?? null,
            items: new Set(),
            builds: new Set(),
          };
          map.set(name, agg);
        }
        agg.items.add(entry.item);
        agg.builds.add(build.id);
      }
    }
  }
  return [...map.entries()].map(([name, agg]) => ({
    name,
    rarity: agg.rarity,
    fromItems: [...agg.items].sort(),
    buildCount: agg.builds.size,
  }));
}
