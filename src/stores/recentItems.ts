import { writable } from "svelte/store";

import { activeItem } from "./modals.js";
import type { ParsedItem } from "../types/inventory.js";

/**
 * The last handful of items the user opened, newest first — surfaced by the
 * command palette when the query is empty so re-opening something is one keystroke.
 * In-memory only: a session-scoped shortcut, not persisted history.
 */
const MAX_RECENTS = 6;

export const recentItems = writable<ParsedItem[]>([]);

// Every item modal opens through activeItem, so one subscription captures them all.
activeItem.subscribe((item) => {
  if (!item) return;
  recentItems.update((list) => {
    const deduped = list.filter((entry) => entry.internalName !== item.internalName);
    deduped.unshift(item);
    return deduped.slice(0, MAX_RECENTS);
  });
});
