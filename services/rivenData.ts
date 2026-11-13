import { readPepDict, readPepExport } from "./bundledGameData";
import { getGameLocale } from "./gameLocale";
import { withScope } from "./logger";
import { levenshteinDistance } from "./rewardScannerUtils";
import { TAG_TO_WFM_URL_NAME } from "../config/shared/wfmRivenVocabulary";
import { statTagToDisplayName } from "../config/shared/rivenStatDisplayNames";
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
export function getRivenTypeEntries(rivenTypeKey: string): UpgradeEntry[] {
  ensureBuilt();
  return _rivenModByKey.get(rivenTypeKey)?.entries || [];
}

export type { UpgradeEntry };

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

// The whole stat pool is read from the game-data package, but a few of its locale
// strings are stale or never translated (e.g. tr still carries the English "Zoom"
// while the live client shows "Yakınlaştırma"). Map the label the game actually
// prints to its canonical tag so the OCR text still resolves. Keyed by game locale.
const MANUAL_LOCALE_STAT_ALIASES: Record<string, Record<string, string>> = {
  tr: {
    // dict.tr carries "%|val| Zoom"; the client renders "Yakınlaştırma".
    Yakınlaştırma: "WeaponZoomFovMod",
  },
};
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
  _gappedOcrPhrases = [];
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
  const gappedSeen = new Set<string>();
  const recordGapped = (raw: string, tag: string, dn: string) => {
    // The value placeholder splits the label only when words precede it.
    const ph = /%?\s*\|[^|]*\|[%s]?\s*/.exec(raw);
    if (!ph || ph.index === 0) return;
    const head = normalizeStatOcrText(cleanLocTag(raw.slice(0, ph.index)));
    const tail = normalizeStatOcrText(cleanLocTag(raw.slice(ph.index + ph[0].length)));
    if (!head || !tail) return;
    const gkey = `${head}|${tail}`;
    if (gappedSeen.has(gkey)) return;
    gappedSeen.add(gkey);
    // Melee faction tags share the base label; fall back to it for canonical casing
    // ("Damage to Corpus") the English parser expects, then the title-cased map.
    const baseTag = tag.replace("WeaponMeleeFaction", "WeaponFaction");
    const resolved = statTagToDisplayName(baseTag);
    const english = resolved !== baseTag ? resolved : TAG_TO_DISPLAY[tag] || dn;
    _gappedOcrPhrases.push({ head, tailNorm: tail, tailWords: tail.split(" "), english });
  };
  for (const [key, mod] of Object.entries(upgrades)) {
    if (!Array.isArray(mod.upgradeEntries) || !key.includes("Randomized")) continue;
    for (const ue of mod.upgradeEntries) {
      if (!ue.tag) continue;
      const locTag = ue.upgradeValues?.[0]?.locTag;
      const raw = locTag ? dict[locTag] || "" : "";
      const dn = cleanLocTag(raw);
      if (!dn) continue;
      if (!_tagToLocaleDisplay.has(ue.tag)) _tagToLocaleDisplay.set(ue.tag, dn);
      addMatch(dn, ue.tag);
      recordGapped(raw, ue.tag, dn);
    }
  }
  _localeMeleeAttackSpeed = cleanLocTag(dict[ATTACK_SPEED_LOC_KEY] || "") || null;
  // The melee card surfaces fire rate as attack speed, so the scanner must map
  // its localized label to the same tag.
  if (_localeMeleeAttackSpeed) addMatch(_localeMeleeAttackSpeed, "WeaponFireRateMod");
  // Overlay the hand-kept labels where the data package's locale string is wrong;
  // the game's real label also wins the display shown to a player in that language.
  const aliases = MANUAL_LOCALE_STAT_ALIASES[locale];
  if (aliases) {
    for (const [label, tag] of Object.entries(aliases)) {
      _tagToLocaleDisplay.set(tag, label);
      addMatch(label, tag);
    }
  }
}

/** Uses Attack Speed for WeaponFireRateMod on melee cards. */
export function getStatDisplayName(tag: string, melee = false): string {
  ensureBuilt();
  ensureLocaleStatDisplay();
  if (melee && tag === "WeaponFireRateMod") return _localeMeleeAttackSpeed || "Attack Speed";
  return _tagToLocaleDisplay.get(tag) || _tagToDisplayName.get(tag) || TAG_TO_DISPLAY[tag] || tag;
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
/** The index of `word` as a whole-word run in `norm` at or after `from`, or -1. */
function wordRunIndex(norm: string, word: string, from: number): number {
  if (!word) return -1;
  let idx = norm.indexOf(word, from);
  while (idx >= 0) {
    const end = idx + word.length;
    if ((idx === 0 || norm[idx - 1] === " ") && (end === norm.length || norm[end] === " ")) {
      return idx;
    }
    idx = norm.indexOf(word, idx + 1);
  }
  return -1;
}

/** Rewrite a faction-style curse whose value splits its label ("Corpus'a x0,56
 *  Hasar verir", the "verir" often wrapped to the next OCR line) into the English
 *  "<value> Damage to Corpus" the parser reads. Returns the rewritten line and how
 *  many following lines it consumed, or null when no gapped label fits. */
function rewriteGappedLine(lines: string[], i: number): { text: string; consumed: number } | null {
  const line = lines[i];
  const { norm, map } = normalizeStatOcrTextWithMap(line);
  if (!norm) return null;
  for (const { head, tailNorm, tailWords, english } of _gappedOcrPhrases) {
    const hIdx = wordRunIndex(norm, head, 0);
    if (hIdx < 0) continue;
    const headEnd = hIdx + head.length;
    const t0 = wordRunIndex(norm, tailWords[0], headEnd);
    if (t0 <= headEnd) continue;
    const rest = norm.slice(t0);
    let consumed = 0;
    let matched = rest === tailNorm || rest.startsWith(`${tailNorm} `);
    if (!matched && tailNorm.startsWith(`${rest} `)) {
      // The tail wrapped onto the next OCR line ("...Hasar" + "verir").
      const remaining = tailNorm.slice(rest.length + 1);
      const next = i + 1 < lines.length ? normalizeStatOcrTextWithMap(lines[i + 1]).norm : "";
      if (next === remaining || next.startsWith(`${remaining} `)) {
        matched = true;
        consumed = 1;
      }
    }
    if (!matched) continue;
    const value = line
      .slice(map[headEnd - 1] + 1, map[t0])
      .trim()
      .replace(/,/g, ".");
    const prefix = line.slice(0, map[hIdx]);
    return { text: `${prefix}${value ? `${value} ` : ""}${english}`, consumed };
  }
  return null;
}

/** Reassemble gapped faction-style labels before the per-line localizer runs. */
function applyGappedLabels(lines: string[]): string[] {
  if (_gappedOcrPhrases.length === 0) return lines;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rewritten = rewriteGappedLine(lines, i);
    if (rewritten) {
      out.push(rewritten.text);
      i += rewritten.consumed;
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

export function localizeRivenOcrText(text: string): string {
  ensureLocaleStatDisplay();
  if (_localeDisplayBuiltFor === "en" || _localeOcrToEnglish.size === 0) return text;
  ensureSortedOcrPhrases();
  return mergeWrappedStatLines(applyGappedLabels(text.split(/\r?\n/)))
    .map(localizeRivenOcrLine)
    .join("\n");
}

function ensureSortedOcrPhrases(): void {
  if (_sortedOcrPhrasesFor === _localeDisplayBuiltFor) return;
  _sortedOcrPhrasesFor = _localeDisplayBuiltFor;
  // Longest first so a multi-word label wins over a bare trailing word.
  _sortedOcrPhrases = [..._localeOcrToEnglish.entries()].sort((a, b) => b[0].length - a[0].length);
}

/** The normalized trailing letter run of a line - its candidate stat label. */
function statTailNorm(line: string): string {
  const match = /([\p{L}][\p{L} ]*)\s*$/u.exec(line);
  return match ? normalizeStatOcrText(match[1]) : "";
}

/** True when a complete known stat label appears as a whole-word run in the line. */
function hasCompleteStatKey(line: string): boolean {
  const norm = normalizeStatOcrText(line);
  for (const [key] of _sortedOcrPhrases) {
    const idx = norm.indexOf(key);
    if (
      idx >= 0 &&
      (idx === 0 || norm[idx - 1] === " ") &&
      (idx + key.length === norm.length || norm[idx + key.length] === " ")
    ) {
      return true;
    }
  }
  return false;
}

/** True when the tail is a strict prefix of a longer known label (label wrapped). */
function isIncompleteKeyPrefix(tail: string): boolean {
  if (!tail) return false;
  const prefix = `${tail} `;
  for (const key of _localeOcrToEnglish.keys()) {
    if (key.length > tail.length && key.startsWith(prefix)) return true;
  }
  return false;
}

/** The OCR wraps a long label onto its own line ("Fazladan Kombo" + "Sayim Sansl"),
 *  so stitch a line to the next while its tail is only a prefix of a known label. */
function mergeWrappedStatLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    let guard = 0;
    while (
      i + 1 < lines.length &&
      guard < 2 &&
      !hasCompleteStatKey(line) &&
      isIncompleteKeyPrefix(statTailNorm(line))
    ) {
      line = `${line} ${lines[i + 1].trim()}`;
      i += 1;
      guard += 1;
    }
    out.push(line);
  }
  return out;
}

// The OCR look-alikes folded to one letter: Turkish accents plus the dotless-i,
// which PaddleOCR reads as i, l or 1 from one scan to the next.
const OCR_CHAR_FOLD: Record<string, string> = {
  ç: "c",
  ş: "s",
  ğ: "g",
  ü: "u",
  ö: "o",
  ı: "i",
  l: "i",
  "1": "i",
  "|": "i",
};

let _sortedOcrPhrases: Array<[string, string]> = [];
let _sortedOcrPhrasesFor: string | null = null;

// Labels whose value placeholder sits between words ("Corpus'a |val| Hasar verir"),
// so the scanned value splits the label and the parser can't see it as one phrase.
// We keep the words before/after the value to reassemble them from OCR text.
let _gappedOcrPhrases: Array<{
  head: string;
  tailNorm: string;
  tailWords: string[];
  english: string;
}> = [];

/** normalizeStatOcrText that also records, for each folded character, its index
 *  in the original line, so a matched phrase maps back to a span to replace. */
function normalizeStatOcrTextWithMap(line: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < line.length; i += 1) {
    const lower = line[i] === "İ" || line[i] === "I" ? "i" : line[i].toLowerCase();
    const folded = OCR_CHAR_FOLD[lower] ?? lower;
    if (/^[a-z0-9]+$/.test(folded)) {
      if (pendingSpace && out.length) {
        out.push(" ");
        map.push(i);
      }
      pendingSpace = false;
      for (const ch of folded) {
        out.push(ch);
        map.push(i);
      }
    } else if (out.length) {
      pendingSpace = true;
    }
  }
  return { norm: out.join(""), map };
}

/** Replace a known localized stat label anywhere in one OCR line with its English
 *  name. Matching the label as a whole-word run (not just the trailing word) lets
 *  it win over qualifiers and multi-word faction labels, e.g. "Kritik Sans (Agir
 *  Saldirilar icin x2)" or "Corpus'a Hasar verir". Non-stat lines pass through. */
function localizeRivenOcrLine(line: string): string {
  const { norm, map } = normalizeStatOcrTextWithMap(line);
  if (!norm) return line;
  ensureSortedOcrPhrases();
  for (const [key, english] of _sortedOcrPhrases) {
    let idx = norm.indexOf(key);
    while (idx >= 0) {
      const end = idx + key.length;
      if ((idx === 0 || norm[idx - 1] === " ") && (end === norm.length || norm[end] === " ")) {
        // Drop a display-only qualifier that trails the stat name on this line
        // ("Kritik Sans (Agir...)"): its "x2" would be read as the next value.
        let suffix = line.slice(map[end - 1] + 1);
        const paren = suffix.indexOf("(");
        if (paren >= 0) suffix = suffix.slice(0, paren);
        return line.slice(0, map[idx]) + english + suffix;
      }
      idx = norm.indexOf(key, idx + 1);
    }
  }
  // No stat here: drop a wrapped "...için x2)" qualifier continuation line whose
  // stray "x2" the English parser would otherwise attach to the next stat.
  if (/\bicin\b/.test(norm)) return "";
  return line;
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
