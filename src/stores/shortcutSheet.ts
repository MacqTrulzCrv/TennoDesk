import { writable } from "svelte/store";

/** Whether the "?" keyboard-shortcut cheat sheet is showing. */
export const shortcutSheetOpen = writable(false);

export function toggleShortcutSheet(): void {
  shortcutSheetOpen.update((open) => !open);
}

export function closeShortcutSheet(): void {
  shortcutSheetOpen.set(false);
}
