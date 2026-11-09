import { derived, type Readable } from "svelte/store";

import { persistedStringList } from "../lib/persistence.js";

// Build ids the user starred, so the shopping list can target them even for
// gear they do not own yet. Kept short; a build id is a stable slug.
const MAX_PINNED_BUILDS = 60;

const pins = persistedStringList("builds.pinned", MAX_PINNED_BUILDS);

/** Pinned build ids, de-duplicated, oldest first. */
export const pinnedBuilds: Readable<string[]> = derived(pins, (list) => [...new Set(list)]);

export function togglePinnedBuild(id: string): void {
  if (!id) return;
  pins.update((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));
}

export function isPinnedBuild(pinned: readonly string[], id: string): boolean {
  return pinned.includes(id);
}
