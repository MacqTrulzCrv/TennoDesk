import { readPepDict, readPepExport } from "./bundledGameData";
import { getGameLocale } from "./gameLocale";
import { withScope } from "./logger";
import { levenshteinDistance } from "./rewardScannerUtils";
import { TAG_TO_WFM_URL_NAME } from "../config/shared/wfmRivenVocabulary";
import { VARIANT_PREFIXES, VARIANT_SUFFIXES } from "../config/shared/weaponVariants";

const log = withScope("rivenData");

interface UpgradeEntry {
  tag: string;
  canBeBuff: boolean;
  canBeCurse: boolean;
  baseValue: number;
  /** Resolved English display name (e.g. "Critical Chance") */
  displayName: string;
  /** Omega prefix syllable (e.g. "crita") - empty if stat has no name contribution */
  prefix: string;
  /** Omega suffix syllable (e.g. "cron") - empty if stat has no name contribution */
  suffix: string;
}

interface WeaponInfo {
  uniqueName: string;
  omegaAttenuation: number;
  productCategory: string;
  holsterCategory: string;
  compatibilityTags: string[];
  shotgunFamily: boolean;
}

interface RivenModInfo {
  uniqueName: string;
  compat: string;
  entries: UpgradeEntry[];
}

let _built = false;

/** Lowercase weapon display name -> weapon info */
const _weaponByNameLc = new Map<string, WeaponInfo>();

/** Lowercase weapon name -> display-cased name (for findWeaponInText) */
const _weaponDisplayNames = new Map<string, string>();

/** Normalized weapon name -> display-cased name */
const _weaponDisplayNamesNormalized = new Map<string, string>();

/** Weapon uniqueName -> display name (reverse lookup for fingerprint compat) */
const _weaponByUniqueName = new Map<string, string>();

/** Riven mod compat path -> riven mod info */
const _rivenModByCompat = new Map<string, RivenModInfo>();

/** Riven mod uniqueName -> riven mod info */
const _rivenModByKey = new Map<string, RivenModInfo>();

/** Upgrade tag -> cleaned display name (from locTags) */
const _tagToDisplayName = new Map<string, string>();

// Manual mapping is required because locTags contain formatting placeholders and color tags.

const STAT_NAME_TO_TAG: Record<string, string> = {
  // Shared ranged stats
  "critical chance": "WeaponCritChanceMod",
  "critical damage": "WeaponCritDamageMod",
  multishot: "WeaponFireIterationsMod",
  "fire rate": "WeaponFireRateMod",
  damage: "WeaponDamageAmountMod",
  "reload speed": "WeaponReloadSpeedMod",
  "status chance": "WeaponStunChanceMod",
  "status duration": "WeaponProcTimeMod",
  "punch through": "WeaponPunctureDepthMod",
  "magazine capacity": "WeaponClipMaxMod",
  "ammo maximum": "WeaponAmmoMaxMod",
  "weapon recoil": "WeaponRecoilReductionMod",
  recoil: "WeaponRecoilReductionMod",
  zoom: "WeaponZoomFovMod",
  "projectile speed": "WeaponProjectileSpeedMod",
  // Physical damage
  impact: "WeaponImpactDamageMod",
  puncture: "WeaponArmorPiercingDamageMod",
  slash: "WeaponSlashDamageMod",
  // Elemental damage
  cold: "WeaponFreezeDamageMod",
  heat: "WeaponFireDamageMod",
  electricity: "WeaponElectricityDamageMod",
  toxin: "WeaponToxinDamageMod",
  // Faction damage (ranged)
  "damage to grineer": "WeaponFactionDamageGrineer",
  "damage to corpus": "WeaponFactionDamageCorpus",
  "damage to infested": "WeaponFactionDamageInfested",
  // Melee-specific
  "melee damage": "WeaponMeleeDamageMod",
  "attack speed": "WeaponFireRateMod",
  range: "WeaponMeleeRangeIncMod",
  "combo duration": "ComboDurationMod",
  "critical chance for slide attack": "SlideAttackCritChanceMod",
  "slide attack": "SlideAttackCritChanceMod",
  "finisher damage": "WeaponMeleeFinisherDamageMod",
  "heavy attack efficiency": "WeaponMeleeComboEfficiencyMod",
  "initial combo": "WeaponMeleeComboInitialBonusMod",
  "chance to gain combo count": "WeaponMeleeComboPointsOnHitMod",
  "additional combo count chance": "WeaponMeleeComboBonusOnHitMod",
};

// Reverse: tag -> canonical display name (used for best-attributes display)
const TAG_TO_DISPLAY: Record<string, string> = {};
for (const [name, tag] of Object.entries(STAT_NAME_TO_TAG)) {
  // Keep first (canonical) mapping per tag
  if (!TAG_TO_DISPLAY[tag]) {
    // Title-case the display name
    TAG_TO_DISPLAY[tag] = name
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
}

const RIFLE_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare";
const PISTOL_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusPistolRandomModRare";
const MELEE_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/PlayerMeleeWeaponRandomModRare";
// Shotgun override: LongGuns with SHOTGUN compat tag -> shotgun riven
const SHOTGUN_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusShotgunRandomModRare";
const ARCHGUN_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusArchgunRandomModRare";

// Modular weapon overrides
const KITGUN_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusModularPistolRandomModRare";
const ZAW_RIVEN_KEY = "/Lotus/Upgrades/Mods/Randomized/LotusModularMeleeRandomModRare";

// Every modular part exports as productCategory Pistols, so the path is the only discriminator.
const MODULAR_MELEE_PATH = /ModularMelee/i;
const MODULAR_PISTOL_PATH = /SUModularSecondary|InfKitGun/i;

const RIVEN_MODS_BY_CATEGORY: Record<string, string> = {
  LongGuns: RIFLE_RIVEN_KEY,
  Pistols: PISTOL_RIVEN_KEY,
  Melee: MELEE_RIVEN_KEY,
  SpaceGuns: ARCHGUN_RIVEN_KEY,
  // Duviri melee - Sun & Moon, Edun, Syam - roll the ordinary melee pool.
  DrifterMelee: MELEE_RIVEN_KEY,
};

/** DE's marker for a companion weapon, the only riven-capable group outside the
 * four main product categories. */
const SENTINEL_WEAPON_TAG = "SENTINEL_WEAPON";

// Companion weapons have NO stat pool of their own - the only randomized
// sentinel entry is the VEILED `RawSentinelWeaponRandomMod`, which has no
// upgradeEntries and `compatName=ANY`. They roll the pool of the class whose
// mods they equip, and `holsterCategory` is where the export states it.
const RIVEN_MODS_BY_HOLSTER: Record<string, string> = {
  RIFLE: RIFLE_RIVEN_KEY,
  SNIPER: RIFLE_RIVEN_KEY,
  BOW: RIFLE_RIVEN_KEY,
  SHOTGUN: SHOTGUN_RIVEN_KEY,
  PISTOL: PISTOL_RIVEN_KEY,
  MELEE: MELEE_RIVEN_KEY,
};

/** Weapon categories whose cards read "Melee Damage" and "Attack Speed". */
const MELEE_CATEGORIES = new Set(["Melee", "SpaceMelee", "DrifterMelee"]);

function stripColorTags(text: string): string {
  // Remove <DT_*_COLOR> tags from localized strings
  return text.replace(/<[^>]+>/g, "").trim();
}

// Ranks entries that share a display name. Duviri exports a Drifter-controlled
// twin of six Tenno melee weapons under the same name at a flat 0.5 dispo; the
// riven belongs to the Tenno entry, so the twin must never win the name key.
function weaponNameRank(productCategory: string): number {
  return productCategory === "DrifterMelee" ? 0 : 1;
}

function normalizeWeaponOcrText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WEAPON_OCR_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  euphona: "Euphona Prime",
  gotva: "Gotva Prime",
  reaper: "Reaper Prime",
});

function cleanLocTag(raw: string): string {
  // locTags look like "|val|% <DT_FIRE_COLOR>Heat" (en) or "%|val| Kritik Hasar"
  // (tr: the percent leads the placeholder). Strip the |val|%, |STAT1|%, |val|s
  // forms - including a percent on either side of the placeholder - and color tags.
  // Replace each removed chunk with a space, not nothing: some languages put the
  // value placeholder between words ("Corpus'a |val| Hasar verir"), and dropping
  // it outright would fuse them.
  let cleaned = raw.replace(/%?\s*\|[^|]*\|[%s]?\s*/g, " ");
  cleaned = stripColorTags(cleaned);
  // Remove parenthetical qualifiers: "(x2 for Bows)", "(x2 for Heavy Attacks)"
  cleaned = cleaned.replace(/\s*\(.*?\)\s*/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

// Mod class comes from the inherited archetype, not holsterCategory: Drakgoon holsters WIDE_RIFLE.
function hasShotgunAncestor(
  uniqueName: string,
  weapons: Record<string, { parentName?: unknown }>,
): boolean {
  const seen = new Set<string>();
  let current: string | undefined = uniqueName;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (/\/Shotgun\//i.test(current)) return true;
    const parent: unknown = weapons[current]?.parentName;
    current = typeof parent === "string" ? parent : undefined;
  }
  return false;
}

function ensureBuilt(): void {
  if (_built) return;
  _built = true;

  try {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped warframe-public-export-plus */
    const dict: Readonly<Record<string, string>> = readPepDict("en") || {};
    const weapons = (readPepExport("ExportWeapons") || {}) as Record<string, Record<string, any>>;
    const upgrades = (readPepExport("ExportUpgrades") || {}) as Record<string, Record<string, any>>;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    let weaponCount = 0;
    for (const [uniqueName, w] of Object.entries(weapons)) {
      if (!uniqueName || uniqueName === "default") continue;
      let name = w.name;
      if (typeof name === "string" && name.startsWith("/")) {
        name = dict[name] || null;
      }
      if (!name || typeof name !== "string") continue;
      if (typeof w.omegaAttenuation !== "number") continue;

      const nameLc = name.toLowerCase();
      const productCategory: string = w.productCategory || "";
      const existing = _weaponByNameLc.get(nameLc);
      // Ties keep the later entry, so a name collision resolves by insertion order.
      if (
        !existing ||
        weaponNameRank(productCategory) >= weaponNameRank(existing.productCategory)
      ) {
        _weaponByNameLc.set(nameLc, {
          uniqueName,
          omegaAttenuation: w.omegaAttenuation,
          productCategory,
          holsterCategory: w.holsterCategory || "",
          compatibilityTags: Array.isArray(w.compatibilityTags) ? w.compatibilityTags : [],
          shotgunFamily: hasShotgunAncestor(uniqueName, weapons),
        });
      }
      _weaponDisplayNames.set(nameLc, name);
      _weaponDisplayNamesNormalized.set(normalizeWeaponOcrText(name), name);
      _weaponByUniqueName.set(uniqueName, name);
      weaponCount++;
    }

    for (const [key, mod] of Object.entries(upgrades)) {
      if (
        !mod.upgradeEntries ||
        !Array.isArray(mod.upgradeEntries) ||
        mod.upgradeEntries.length === 0
      )
        continue;
      if (!key.includes("Randomized")) continue; // skip non-riven mods with upgradeEntries

      const entries: UpgradeEntry[] = [];
      for (const ue of mod.upgradeEntries) {
        const baseValue = ue.upgradeValues?.[0]?.value ?? 0;
        const locTag = ue.upgradeValues?.[0]?.locTag;
        let displayName = locTag ? dict[locTag] || "" : "";
        displayName = cleanLocTag(displayName);
        if (!displayName) displayName = TAG_TO_DISPLAY[ue.tag] || ue.tag;

        entries.push({
          tag: ue.tag,
          canBeBuff: !!ue.canBeBuff,
          canBeCurse: !!ue.canBeCurse,
          baseValue,
          displayName,
          prefix: (ue.prefixTag && dict[ue.prefixTag]) || "",
          suffix: (ue.suffixTag && dict[ue.suffixTag]) || "",
        });

        // Populate tag -> display name from resolved locTags
        if (displayName && !_tagToDisplayName.has(ue.tag)) {
          _tagToDisplayName.set(ue.tag, displayName);
        }
      }

      const info: RivenModInfo = {
        uniqueName: key,
        compat: mod.compat || "",
        entries,
      };
      _rivenModByKey.set(key, info);
      if (mod.compat) {
        _rivenModByCompat.set(mod.compat, info);
      }
    }

    log.info(`[RivenData] Indexed ${weaponCount} weapons, ${_rivenModByKey.size} riven mod types`);
  } catch (err) {
    log.error("[RivenData] Failed to build indexes:", err);
  }
}

/** Resolves a riven fingerprint compat path to a weapon display name. */
export function getWeaponNameByUniqueName(uniqueName: string): string | null {
  ensureBuilt();
  return _weaponByUniqueName.get(uniqueName) || null;
}

/** Returns weapon disposition by display name, or null when unknown. */
export function getWeaponDisposition(weaponName: string): number | null {
  ensureBuilt();
  const info = _weaponByNameLc.get(weaponName.toLowerCase());
  return info ? info.omegaAttenuation : null;
}

/** True when the card reads "Melee Damage" and "Attack Speed" for this weapon.
 * Deconstructor is a SentinelWeapons product but holsters as MELEE. */
export function isMeleeWeapon(weaponName: string): boolean {
  ensureBuilt();
  const info = _weaponByNameLc.get(weaponName.toLowerCase());
  if (!info) return false;
  if (MODULAR_MELEE_PATH.test(info.uniqueName)) return true;
  return MELEE_CATEGORIES.has(info.productCategory) || info.holsterCategory === "MELEE";
}

/** Resolves the riven mod uniqueName for a weapon, or null when unknown. */
export function resolveRivenType(weaponName: string): string | null {
  ensureBuilt();
  const info = _weaponByNameLc.get(weaponName.toLowerCase());
  if (!info) return null;

  const cat = info.productCategory;

  if (
    cat === "LongGuns" &&
    (info.holsterCategory === "SHOTGUN" ||
      info.compatibilityTags.includes("SHOTGUN") ||
      info.shotgunFamily)
  ) {
    return SHOTGUN_RIVEN_KEY;
  }

  if (MODULAR_MELEE_PATH.test(info.uniqueName)) return ZAW_RIVEN_KEY;
  if (MODULAR_PISTOL_PATH.test(info.uniqueName)) return KITGUN_RIVEN_KEY;

  const byCategory = RIVEN_MODS_BY_CATEGORY[cat];
  if (byCategory) return byCategory;

  // Only companion weapons get the holster fallback. A leftover omegaAttenuation
  // proves nothing - exalted, hound and Sirocco all carry one without rivens.
  // The veiled mod is the real marker: RawSentinelWeaponRandomMod exists, and no
  // veiled exalted/hound/amp riven does.
  if (!info.compatibilityTags.includes(SENTINEL_WEAPON_TAG)) return null;

  // Burst Laser and its Prime/Prisma variants carry no holsterCategory at all;
  // the class is still stated, in the path.
  const holster = info.holsterCategory || (/Pistol$/i.test(info.uniqueName) ? "PISTOL" : "");
  return RIVEN_MODS_BY_HOLSTER[holster] || null;
}

/** Returns the upgrade entries for a riven mod type. */
function getRivenTypeEntries(rivenTypeKey: string): UpgradeEntry[] {
  ensureBuilt();
  return _rivenModByKey.get(rivenTypeKey)?.entries || [];
}

/** Maps an OCR stat label to its upgrade tag, or null when unknown. */
export function statNameToTag(statName: string): string | null {
  const lc = statName.toLowerCase().trim();
  const canonical = STAT_NAME_TO_TAG[lc];
  if (canonical) return canonical;
  // A localized client's OCR text ("Coklu Atis") matches the game-language label.
  ensureLocaleStatDisplay();
  return _localeStatNameToTag.get(normalizeStatOcrText(statName)) || null;
}

// Stat names are shown in the player's game language while the canonical English
// names stay the WFM search and OCR match keys. The melee fire-rate stat is
// surfaced as "Attack Speed", which the game localizes under its own key.
const ATTACK_SPEED_LOC_KEY = "/Lotus/Language/Upgrades/AttackSpeedBuffDesc";
let _tagToLocaleDisplay = new Map<string, string>();
let _localeStatNameToTag = new Map<string, string>();
let _localeOcrToEnglish = new Map<string, string>();
let _localeMeleeAttackSpeed: string | null = null;
let _localeDisplayBuiltFor: string | null = null;

/** Fold a stat label to an OCR-tolerant key. PaddleOCR drops Turkish accents
 *  ("Çoklu Atış" -> "Coklu Atis") and reads the dotless-i as i, l or 1
 *  interchangeably ("Statü Şansı" -> "Statu Sansl"), so the dictionary labels and
 *  the scanned text both collapse those look-alikes to one letter before matching. */
function normalizeStatOcrText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ıl1|]/g, "i")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a tag -> localized stat display map for the active game language. A
 *  no-op in English (the canonical maps already hold it). Lazy and cached per
 *  locale, rebuilt when the game language changes. */
function ensureLocaleStatDisplay(): void {
  const locale = getGameLocale();
  if (_localeDisplayBuiltFor === locale) return;
  _localeDisplayBuiltFor = locale;
  _tagToLocaleDisplay = new Map();
  _localeStatNameToTag = new Map();
  _localeOcrToEnglish = new Map();
  _localeMeleeAttackSpeed = null;
  if (locale === "en") return;
  const dict = readPepDict(locale);
  if (!dict) return;
  const upgrades = (readPepExport("ExportUpgrades") || {}) as Record<
    string,
    { upgradeEntries?: Array<{ tag?: string; upgradeValues?: Array<{ locTag?: string }> }> }
  >;
  const addMatch = (name: string, tag: string) => {
    const key = normalizeStatOcrText(name);
    if (!key) return;
    if (!_localeStatNameToTag.has(key)) _localeStatNameToTag.set(key, tag);
    // The English label the OCR parser's known-stat vocabulary expects.
    if (!_localeOcrToEnglish.has(key)) {
      _localeOcrToEnglish.set(key, TAG_TO_DISPLAY[tag] || _tagToDisplayName.get(tag) || name);
    }
  };
  for (const [key, mod] of Object.entries(upgrades)) {
    if (!Array.isArray(mod.upgradeEntries) || !key.includes("Randomized")) continue;
    for (const ue of mod.upgradeEntries) {
      if (!ue.tag) continue;
      const locTag = ue.upgradeValues?.[0]?.locTag;
      const dn = cleanLocTag(locTag ? dict[locTag] || "" : "");
      if (!dn) continue;
      if (!_tagToLocaleDisplay.has(ue.tag)) _tagToLocaleDisplay.set(ue.tag, dn);
      addMatch(dn, ue.tag);
    }
  }
  _localeMeleeAttackSpeed = cleanLocTag(dict[ATTACK_SPEED_LOC_KEY] || "") || null;
  // The melee card surfaces fire rate as attack speed, so the scanner must map
  // its localized label to the same tag.
  if (_localeMeleeAttackSpeed) addMatch(_localeMeleeAttackSpeed, "WeaponFireRateMod");
}

/** Uses Attack Speed for WeaponFireRateMod on melee cards. */
export function getStatDisplayName(tag: string, melee = false): string {
  ensureBuilt();
  ensureLocaleStatDisplay();
  if (melee && tag === "WeaponFireRateMod") return _localeMeleeAttackSpeed || "Attack Speed";
  return (
    _tagToLocaleDisplay.get(tag) || _tagToDisplayName.get(tag) || TAG_TO_DISPLAY[tag] || tag
  );
}

/** The localized stat label for a tag, or null in English / when unknown. Lets a
 *  caller keep its own English labels and only overlay the player's language. */
export function getLocalizedStatDisplay(tag: string, melee = false): string | null {
  ensureLocaleStatDisplay();
  if (_localeDisplayBuiltFor === "en") return null;
  if (melee && tag === "WeaponFireRateMod") return _localeMeleeAttackSpeed;
  return _tagToLocaleDisplay.get(tag) || null;
}

/** Rewrite localized riven stat labels in raw OCR text to their canonical English
 *  names so the English stat parser can read a localized client's card. PaddleOCR
 *  drops the accents, so "Coklu Atis" matches the folded "coklu atis" key. A no-op
 *  in English. */
export function localizeRivenOcrText(text: string): string {
  ensureLocaleStatDisplay();
  if (_localeDisplayBuiltFor === "en" || _localeOcrToEnglish.size === 0) return text;
  return text
    .split(/\r?\n/)
    .map(localizeRivenOcrLine)
    .join("\n");
}

/** Replace the trailing stat-label run of one OCR line with its English name.
 *  The label sits after the value and any stray punctuation, so match the final
 *  run of letters, fold it, and look it up (exact, then within a small edit
 *  budget to absorb residual OCR slips). Non-stat lines are left untouched. */
function localizeRivenOcrLine(line: string): string {
  const match = /([\p{L}][\p{L} ]*)\s*$/u.exec(line);
  if (!match) return line;
  const key = normalizeStatOcrText(match[1]);
  if (!key) return line;
  const english = _localeOcrToEnglish.get(key) ?? fuzzyOcrStatLookup(key);
  return english ? line.slice(0, match.index) + english : line;
}

/** Nearest known stat label within ~20% edit distance, or null. */
function fuzzyOcrStatLookup(key: string): string | null {
  const budget = Math.max(1, Math.floor(key.length * 0.2));
  let best: string | null = null;
  let bestDistance = budget + 1;
  for (const [candidate, english] of _localeOcrToEnglish) {
    if (Math.abs(candidate.length - key.length) > budget) continue;
    const distance = levenshteinDistance(key, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = english;
    }
  }
  return best;
}

/** Finds an upgrade entry by tag within a riven type. */
export function findUpgradeEntry(rivenTypeKey: string, tag: string): UpgradeEntry | null {
  const entries = getRivenTypeEntries(rivenTypeKey);
  // Melee faction damage uses distinct tags, so fall back to suffix matching
  // only after an exact match fails.
  let found = entries.find((e) => e.tag === tag);
  if (!found) {
    // Try matching without the "Melee" prefix - e.g. "WeaponMeleeFactionDamageCorpus"
    // when we looked up "WeaponFactionDamageCorpus"
    const meleeFallback = tag.replace("WeaponFaction", "WeaponMeleeFaction");
    found = entries.find((e) => e.tag === meleeFallback);
  }
  if (!found) {
    // Try matching without the "Melee" prefix - e.g. "WeaponDamageAmountMod"
    // when melee uses "WeaponMeleeDamageMod"
    if (tag === "WeaponDamageAmountMod") {
      found = entries.find((e) => e.tag === "WeaponMeleeDamageMod");
    }
  }
  return found || null;
}

// Matches RivenParser.js: sort buffs by descending fingerprint Value, then baseValue.
// Curses do not contribute; prefixes precede the final suffix.
export function generateRivenSuffix(
  rivenTypeKey: string,
  buffs: Array<{ tag: string; value: number }>,
): string {
  const entries = getRivenTypeEntries(rivenTypeKey);
  if (entries.length === 0 || buffs.length === 0) return "";

  const findEntry = (tag: string) => {
    let e = entries.find((x) => x.tag === tag);
    if (!e) {
      const meleeFallback = tag.replace("WeaponFaction", "WeaponMeleeFaction");
      e = entries.find((x) => x.tag === meleeFallback);
    }
    if (!e && tag === "WeaponDamageAmountMod") {
      e = entries.find((x) => x.tag === "WeaponMeleeDamageMod");
    }
    return e;
  };

  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  const sorted = [...buffs].sort((a, b) => {
    if (a.value === b.value) {
      return (findEntry(a.tag)?.baseValue ?? 0) - (findEntry(b.tag)?.baseValue ?? 0);
    }
    return b.value - a.value;
  });

  if (sorted.length === 1) {
    const entry = findEntry(sorted[0].tag);
    if (!entry?.prefix) return "";
    return titleCase(entry.prefix) + (entry.suffix || "").toLowerCase();
  }

  let name = "";
  for (let i = 0; i < sorted.length; i++) {
    const entry = findEntry(sorted[i].tag);
    if (!entry) continue;
    if (i === sorted.length - 1) {
      name += (entry.suffix || "").toLowerCase();
    } else if (name === "") {
      if (entry.prefix) name += titleCase(entry.prefix);
    } else {
      if (entry.prefix) name += "-" + entry.prefix.toLowerCase();
    }
  }
  return name;
}

/** Prefers the longest OCR weapon match so "Bo" does not match inside "Boar",
 * and only at the start of a line, where a card's "<Weapon> <RivenSuffix>" puts
 * it. Suffixes are built from stat syllables ("Lexi-gelitron") that collide with
 * short weapon names and graded the wrong gun when the real one was unknown. */
export function findWeaponInText(text: string): string | null {
  ensureBuilt();
  const lineStarts = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);

  let bestExact: string | null = null;
  let bestExactLen = 0;
  for (const [nameLc] of _weaponByNameLc) {
    if (nameLc.length <= bestExactLen) continue;
    if (nameLc.length < 3) continue; // skip very short names to avoid false positives
    // Anchored, and on a word boundary: "Lex" must not match "Lexi-gelitron".
    const anchored = lineStarts.some(
      (line) => line.startsWith(nameLc) && !/[a-z0-9]/.test(line.charAt(nameLc.length)),
    );
    if (anchored) {
      // Keys are lowercased; recover the display-cased name from the parallel map.
      bestExact = _weaponDisplayNames.get(nameLc) || nameLc;
      bestExactLen = nameLc.length;
    }
  }

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWeaponOcrText(line))
    .filter((line) => line.length >= 4)
    .slice(0, 4);

  for (const line of lines) {
    const alias = WEAPON_OCR_ALIASES[line];
    if (alias) return alias;
  }

  let bestCandidate: { name: string; distance: number; tokenCount: number } | null = null;

  for (const line of lines) {
    const words = line.split(" ").filter((word) => word.length >= 2);
    if (words.length === 0) continue;

    // Only phrases that begin the line - see the anchoring note above.
    for (let len = 1; len <= 4 && len <= words.length; len += 1) {
      const phrase = words.slice(0, len).join(" ").trim();
      if (phrase.length < 4) continue;

      const directAlias = WEAPON_OCR_ALIASES[phrase];
      if (directAlias) return directAlias;

      for (const [normalizedWeapon, displayName] of _weaponDisplayNamesNormalized) {
        if (!normalizedWeapon) continue;

        const phraseWords = phrase.split(" ");
        const weaponWords = normalizedWeapon.split(" ");
        if (Math.abs(phraseWords.length - weaponWords.length) > 1) continue;

        const maxDistance =
          normalizedWeapon.length >= 14 ? 3 : normalizedWeapon.length >= 8 ? 2 : 1;
        const distance = levenshteinDistance(phrase, normalizedWeapon);
        if (distance > maxDistance) continue;

        if (
          !bestCandidate ||
          distance < bestCandidate.distance ||
          (distance <= bestCandidate.distance + 1 && weaponWords.length > bestCandidate.tokenCount)
        ) {
          bestCandidate = {
            name: displayName,
            distance,
            tokenCount: weaponWords.length,
          };
        }
      }
    }
  }

  if (bestCandidate?.name) {
    if (!bestExact) return bestCandidate.name;
    const bestCandidateWords = normalizeWeaponOcrText(bestCandidate.name).split(" ").length;
    const bestExactWords = normalizeWeaponOcrText(bestExact).split(" ").length;
    if (bestCandidateWords > bestExactWords) return bestCandidate.name;
  }

  return bestExact ?? bestCandidate?.name ?? null;
}

export interface WeaponLabelMatch {
  name: string;
  /** True for a byte-exact (normalized) hit; false for a distance-tolerant one. */
  exact: boolean;
}

/** Matches whole OCR lines against the weapon list. The panel caption holds
 * nothing but a weapon name, so unlike findWeaponInText only a full-line hit
 * counts; that is what keeps FITS IN, CANCEL and stat rows from ever matching. */
// Shortest plate line a one-letter miss may match: Akzani is six characters.
const MIN_FUZZY_LABEL_CHARS = 5;

export function findWeaponByLabelLine(lines: string[]): WeaponLabelMatch | null {
  ensureBuilt();
  let best: { name: string; exact: boolean; len: number; distance: number } | null = null;
  for (const raw of lines) {
    const norm = normalizeWeaponOcrText(raw);
    if (norm.length < 3) continue;

    const exactName = _weaponDisplayNamesNormalized.get(norm);
    if (exactName) {
      if (!best || !best.exact || norm.length > best.len) {
        best = { name: exactName, exact: true, len: norm.length, distance: 0 };
      }
      continue;
    }

    if (norm.length < MIN_FUZZY_LABEL_CHARS || best?.exact) continue;
    const maxDistance = norm.length >= 14 ? 2 : 1;
    let lineBest: { name: string; distance: number } | null = null;
    let ambiguous = false;
    for (const [normalizedWeapon, displayName] of _weaponDisplayNamesNormalized) {
      if (Math.abs(normalizedWeapon.length - norm.length) > maxDistance) continue;
      const distance = levenshteinDistance(norm, normalizedWeapon);
      if (distance > maxDistance) continue;
      if (!lineBest || distance < lineBest.distance) {
        lineBest = { name: displayName, distance };
        ambiguous = false;
      } else if (distance === lineBest.distance && displayName !== lineBest.name) {
        ambiguous = true;
      }
    }
    if (!lineBest || ambiguous) continue;
    if (
      !best ||
      lineBest.distance < best.distance ||
      (lineBest.distance === best.distance && norm.length > best.len)
    ) {
      best = { name: lineBest.name, exact: false, len: norm.length, distance: lineBest.distance };
    }
  }
  return best ? { name: best.name, exact: best.exact } : null;
}

/** Derives the WFM riven family slug, such as "Boar Prime" -> "boar". */
export function getRivenFamilySlug(weaponName: string): string {
  ensureBuilt();
  // An affix only marks a variant when the plain weapon exists. Gotva Prime and
  // Kuva Bramma have no base form, so they are their own family - stripping it
  // asks WFM for a weapon that was never made.
  const baseIfKnown = (candidate: string, fallback: string): string =>
    _weaponByNameLc.has(candidate.toLowerCase()) ? candidate : fallback;

  let name = weaponName.trim();
  for (const suffix of VARIANT_SUFFIXES) {
    if (!name.toLowerCase().endsWith(suffix.toLowerCase())) continue;
    name = baseIfKnown(name.slice(0, -suffix.length), name);
    break;
  }
  for (const prefix of VARIANT_PREFIXES) {
    if (!name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    name = baseIfKnown(name.slice(prefix.length), name);
    break;
  }
  // WFM spells the ampersand out: its riven weapon list has silva_and_aegis and
  // no silva_aegis, so dropping the "&" asks for a weapon it does not carry.
  return name
    .replace(/&/g, " and ")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Returns every variant and disposition in a weapon's riven family. */
export function getFamilyVariants(
  weaponName: string,
): Array<{ name: string; disposition: number }> {
  ensureBuilt();
  const slug = getRivenFamilySlug(weaponName);
  if (!slug) return [];
  const out: Array<{ name: string; disposition: number }> = [];
  for (const name of _weaponDisplayNames.values()) {
    if (getRivenFamilySlug(name) !== slug) continue;
    const info = _weaponByNameLc.get(name.toLowerCase());
    if (info) out.push({ name, disposition: info.omegaAttenuation });
  }
  return out;
}

/** Returns sorted weapon names that have riven disposition. */
export function getAllRivenWeaponNames(): string[] {
  ensureBuilt();
  const names = [..._weaponDisplayNames.values()];
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/** Returns common riven stat tags for WFM auction filters. */
export function getRivenStatOptions(): { tag: string; wfmUrlName: string; displayName: string }[] {
  ensureBuilt();
  const result: { tag: string; wfmUrlName: string; displayName: string }[] = [];
  const seen = new Set<string>();
  for (const [tag, wfmName] of Object.entries(TAG_TO_WFM_URL_NAME)) {
    if (seen.has(wfmName)) continue;
    seen.add(wfmName);
    result.push({ tag, wfmUrlName: wfmName, displayName: getStatDisplayName(tag) });
  }
  result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return result;
}
