// DE ships a name dictionary per client language, so localized item names need no
// human translation. English stays canonical everywhere inside main: it is the
// join key for warframe.market, OCR matching and every by-name lookup we own.

import fs from "node:fs";
import path from "node:path";

import { normalizeErrorMessage } from "../config/shared/errors";
import { withScope } from "./logger";

const log = withScope("gameLocale");

export const GAME_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tc",
  "th",
  "tr",
  "uk",
  "zh",
] as const;

type GameLocale = (typeof GAME_LOCALES)[number];

export const DEFAULT_GAME_LOCALE: GameLocale = "en";

type NameMap = Readonly<Record<string, string>>;

const EMPTY: NameMap = Object.freeze({});

let activeLocale: GameLocale = DEFAULT_GAME_LOCALE;
let activeNames: NameMap = EMPTY;
const cache = new Map<GameLocale, NameMap>();

export function isGameLocale(value: unknown): value is GameLocale {
  return typeof value === "string" && (GAME_LOCALES as readonly string[]).includes(value);
}

// Read from disk rather than importing: resolveJsonModule would hand tsc fifteen
// 7500-key literal types to infer, and the build slows to a crawl.
function candidateFiles(code: GameLocale): string[] {
  const parts = ["src", "data", "itemNames", `${code}.json`];
  return [
    path.resolve(__dirname, "..", ...parts),
    path.resolve(__dirname, "..", "..", ...parts),
    path.resolve(process.cwd(), ...parts),
  ];
}

function loadNames(code: GameLocale): NameMap {
  const cached = cache.get(code);
  if (cached) return cached;
  if (code === DEFAULT_GAME_LOCALE) {
    cache.set(code, EMPTY);
    return EMPTY;
  }
  for (const file of candidateFiles(code)) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as NameMap;
      log.info(`${code}: ${Object.keys(parsed).length} names loaded`);
      cache.set(code, parsed);
      return parsed;
    } catch (err) {
      log.warn(`${code}: failed to read ${file}: ${normalizeErrorMessage(err)}`);
    }
  }
  log.warn(`${code}: no name table found, falling back to English`);
  cache.set(code, EMPTY);
  return EMPTY;
}

/** Returns the newly active locale, or null when nothing changed. */
export function setGameLocale(code: unknown): GameLocale | null {
  const next = isGameLocale(code) ? code : DEFAULT_GAME_LOCALE;
  if (next === activeLocale) return null;
  activeLocale = next;
  activeNames = loadNames(next);
  return next;
}

/**
 * Localized name for a `/Lotus/Language/...` key, or the English fallback.
 * A locale may be partial, so every hole resolves to English.
 */
export function localizeName(nameKey: string | null | undefined, fallback: string): string {
  if (!nameKey) return fallback;
  return activeNames[nameKey] || fallback;
}

/** Active game language code, for callers that pick a whole DE dictionary. */
export function getGameLocale(): string {
  return activeLocale;
}

/** True while the active locale can actually change a name. */
export function isLocalizingNames(): boolean {
  return activeLocale !== DEFAULT_GAME_LOCALE && Object.keys(activeNames).length > 0;
}

// --- Reverse resolution: localized item name -> canonical English ------------
// EE.log hands us localized free text (e.g. a trade dialog in Turkish), but every
// by-name join inside main is English. The en.json table shares the same
// `/Lotus/Language/...` keys as each locale table, so the inverse is exact: a
// localized value maps back to its key, then forward to English.

// The DE pattern that wraps a component's name into its blueprint, e.g.
// en "|ITEM| Blueprint", tr "|ITEM| Kalıp". Used to peel a localized blueprint
// suffix before resolving the base part.
const BLUEPRINT_AND_ITEM_KEY = "/Lotus/Language/Items/BlueprintAndItem";
const BLUEPRINT_PLACEHOLDER = "|ITEM|";

let englishNames: NameMap | null = null;
let reverseIndex: Map<string, string> | null = null;
let reverseBuiltFor: GameLocale | null = null;
let activeBlueprintSuffix: string | null = null;

/** en.json keyed by lang key; loaded on demand (loadNames keeps English EMPTY by
 *  design, so reverse resolution reads the file itself). */
function getEnglishNames(): NameMap {
  if (englishNames) return englishNames;
  for (const file of candidateFiles("en")) {
    try {
      if (!fs.existsSync(file)) continue;
      englishNames = JSON.parse(fs.readFileSync(file, "utf-8")) as NameMap;
      return englishNames;
    } catch (err) {
      log.warn(`en (reverse): failed to read ${file}: ${normalizeErrorMessage(err)}`);
    }
  }
  englishNames = EMPTY;
  return englishNames;
}

/** Captures the text wrapped by a "|ITEM| X" pattern so a localized blueprint
 *  name can be peeled back to its base part. Null when the pattern is unusable. */
function blueprintSuffix(pattern: string | undefined): string | null {
  if (!pattern) return null;
  const idx = pattern.indexOf(BLUEPRINT_PLACEHOLDER);
  if (idx < 0) return null;
  const suffix = pattern.slice(idx + BLUEPRINT_PLACEHOLDER.length).trim();
  return suffix || null;
}

function ensureReverseIndex(): void {
  if (reverseBuiltFor === activeLocale && reverseIndex) return;
  const index = new Map<string, string>();
  // First key wins on collisions so the result is deterministic across runs.
  for (const [key, value] of Object.entries(activeNames)) {
    const lc = value.trim().toLowerCase();
    if (lc && !index.has(lc)) index.set(lc, key);
  }
  reverseIndex = index;
  activeBlueprintSuffix = blueprintSuffix(activeNames[BLUEPRINT_AND_ITEM_KEY]);
  reverseBuiltFor = activeLocale;
}

/** Direct localized value -> English, no blueprint peeling. */
function directEnglish(localizedLc: string): string | null {
  ensureReverseIndex();
  const key = reverseIndex?.get(localizedLc);
  if (!key) return null;
  const en = getEnglishNames()[key];
  return en ? en.trim() : null;
}

/**
 * Canonical English name for a localized item name, or null when it is already
 * English / cannot be resolved (caller keeps the original). A no-op in English.
 */
export function localizedToEnglishItemName(name: string | null | undefined): string | null {
  if (!name || activeLocale === DEFAULT_GAME_LOCALE) return null;
  const lc = name.trim().toLowerCase();
  if (!lc) return null;

  const direct = directEnglish(lc);
  if (direct) return direct;

  // "Gauss Prime Sistemleri Kalıp" -> peel "Kalıp" -> resolve base -> "... Blueprint".
  // lookupTradedCatalogItem strips a trailing " Blueprint", so the suffix is safe
  // for both the main blueprint and part blueprints.
  if (activeBlueprintSuffix) {
    const suffix = ` ${activeBlueprintSuffix}`.toLowerCase();
    if (lc.endsWith(suffix)) {
      const baseLc = lc.slice(0, -suffix.length).trim();
      const enBase = directEnglish(baseLc);
      if (enBase) return `${enBase} Blueprint`;
    }
  }
  return null;
}

/** Test seam: drop cached reverse tables so a fresh locale rebuilds them. */
export function __resetReverseCacheForTest(): void {
  englishNames = null;
  reverseIndex = null;
  reverseBuiltFor = null;
  activeBlueprintSuffix = null;
}
