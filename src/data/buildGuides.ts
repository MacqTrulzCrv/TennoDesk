// Typed shim over the curated build table (scripts/validate-build-guides.mjs
// checks every mod, arcane, stance and item name against @wfcd/items before it
// ships, and that per-type fields like aura or stance sit on the right builds).
import data from "./buildGuides.json";
import modMeta from "./buildGuideModMeta.json";
import notesEn from "./buildGuideNotesEn.json";

export type BuildFocus = "general" | "steelpath";
export type BuildRole = "dps" | "support" | "tank" | "farm" | "utility";
export type BuildItemType = "warframe" | "primary" | "secondary" | "melee";

interface BuildGuide {
  id: string;
  name: string;
  focus: BuildFocus;
  roles: BuildRole[];
  forma: number;
  mods: string[];
  arcanes: string[];
  /** Warframe builds only. */
  aura?: string;
  exilus?: string;
  archonShards?: string;
  helminth?: { ability: string; replaces: string } | null;
  /** Melee builds only. */
  stance?: string;
  /** Curator's commentary; the data set is maintained in Turkish. */
  notesTr: string;
  sources: string[];
}

export interface BuildGuideItem {
  item: string;
  type: BuildItemType;
  builds: BuildGuide[];
}

interface BuildGuideTable {
  version: number;
  updatedAt: string;
  notes: string;
  items: BuildGuideItem[];
}

export const BUILD_GUIDES = data as BuildGuideTable;

type ModRarity = "Common" | "Uncommon" | "Rare" | "Legendary";

interface BuildModMeta {
  rarity: ModRarity;
  polarity: string | null;
  /** Capacity at max rank; negative means the mod adds capacity (aura/stance). */
  drain: number | null;
}

export const BUILD_MOD_META = modMeta as Record<string, BuildModMeta>;

/** English note per build id; the validator keeps it in lockstep with the guide. */
export const BUILD_NOTES_EN = notesEn as Record<string, string>;
