import { writable } from "svelte/store";

/** Whether the ⌘K / Ctrl+K command palette overlay is open. Main window only. */
export const paletteOpen = writable(false);

export function openPalette(): void {
  paletteOpen.set(true);
}

export function closePalette(): void {
  paletteOpen.set(false);
}

export function togglePalette(): void {
  paletteOpen.update((open) => !open);
}
