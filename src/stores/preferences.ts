import { writable } from "svelte/store";

import { VALUE_MIN_PLATINUM_PRESETS } from "../lib/inventory/valueTotals.js";
import {
  persistedBoolean,
  persistedPresetNumber,
  persistedString,
  readStorage,
  writeStorage,
} from "../lib/persistence.js";

export const hideFounderMasteryItems = persistedBoolean("wf_hide_founder_mastery_items", false);
export const hideFoundryClaims = persistedBoolean("wf_hide_foundry_claims", true);
export const autoFocusSearch = persistedBoolean("wf_auto_focus_search", false);
export const showMasteredBadges = persistedBoolean("wf_show_mastered_badges", true);
export const showOwnedParentBadges = persistedBoolean("wf_show_owned_parent_badges", true);
// The parent-owned toggle used to hide F as well, so it seeds the F toggle once.
if (readStorage("wf_show_foundry_ready_badges") == null) {
  writeStorage(
    "wf_show_foundry_ready_badges",
    readStorage("wf_show_owned_parent_badges") === "0" ? "0" : "1",
  );
}
export const showFoundryReadyBadges = persistedBoolean("wf_show_foundry_ready_badges", true);
export const showVaultedBadges = persistedBoolean("wf_show_vaulted_badges", true);
// A short confirmation tick when an action lands (e.g. a listing is posted).
export const soundFeedback = persistedBoolean("wf_sound_feedback", true);
// Default to the full tab so every category (mods, arcanes, resources, pets)
// shows its own stock on open; the prime-only lens is an opt-in the user flips
// on the tabs where selling prime parts is the point.
export const inventoryValueAllTradables = persistedBoolean(
  "wf_inventory_value_all_tradables",
  true,
);
export const inventoryValueMinPlatinum = persistedPresetNumber(
  "wf_inventory_value_min_plat",
  VALUE_MIN_PLATINUM_PRESETS,
  0,
);
// Hide rows the user owns a single copy of, leaving only the spares that are
// safe to sell. Inventory and the market Sellables tab keep separate switches:
// one is a collection view, the other a selling screen, so their lenses differ.
export const inventoryHideSingles = persistedBoolean("wf_inventory_hide_singles", false);
export const marketSellablesHideSingles = persistedBoolean(
  "wf_market_sellables_hide_singles",
  false,
);

export const SETTINGS_CATEGORIES = [
  "general",
  "notifications",
  "inventory",
  "overlay",
  "appearance",
  "about",
] as const;
export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];
export const SETTINGS_CATEGORY_STORAGE_KEY = "wf_settings_category";
export const settingsCategory = persistedString<SettingsCategory>(
  SETTINGS_CATEGORY_STORAGE_KEY,
  SETTINGS_CATEGORIES,
  "general",
);
export type SettingsSectionTarget = "missions";
export const settingsSectionTarget = writable<SettingsSectionTarget | null>(null);

export const APPEARANCE_TABS = ["theme", "colors", "overlays", "sidebar", "css"] as const;
export type AppearanceTab = (typeof APPEARANCE_TABS)[number];
export const appearanceTab = persistedString<AppearanceTab>(
  "wf_settings_appearance_tab",
  APPEARANCE_TABS,
  "theme",
);
