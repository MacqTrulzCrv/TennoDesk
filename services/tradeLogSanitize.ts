// Strip both live UTF-8 platform glyphs and legacy Latin-1 mojibake.

const PUA_GLYPHS = /[\uE000-\uF8FF\uFFFD]+/g;
const MOJIBAKE_GLYPHS = /[\u00EE\u00EF][\u0080-\u00BF]{2}/g;
// Trailing glyphs and invisible format marks the game appends (directional
// marks, zero-width chars, BOM, PUA survivors). NOT general non-ASCII: localized
// item names and usernames legitimately end in real letters (\u00FC, \u00DF, \u015F, \u2026).
const TRAILING_GLYPHS = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\uE000-\uF8FF\uFFFD]+$/;

export function stripPlatformGlyphs(value: string): string {
  return value
    .replace(PUA_GLYPHS, "")
    .replace(MOJIBAKE_GLYPHS, "")
    .replace(TRAILING_GLYPHS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Log framework line, not an item ("11828.904 Script [Info]: Dialog.lua: ...").
export function isLogFrameworkLine(value: string): boolean {
  return (
    /^\d+\.\d+\s/.test(value) ||
    /\[(Info|Error|Warning)\]/.test(value) ||
    /\b[A-Za-z_]+\.lua\b/.test(value)
  );
}

// Dialog::CreateOkCancel arg tail glued to the last item ("..., title= leftItem=/...").
export function stripDialogArgTail(value: string): string {
  return value.replace(/,?\s*\b(?:title|leftItem|rightItem)=.*$/i, "");
}
