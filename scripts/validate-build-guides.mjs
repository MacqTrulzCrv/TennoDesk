// Validates src/data/buildGuides.json against the @wfcd/items database so a
// typo'd or renamed name can never ship: every aura/exilus/stance/mod must
// exist in Mods.json, every arcane in Arcanes.json and every item in the
// database file its type names (Warframes/Primary/Secondary/Melee). On success
// it regenerates src/data/buildGuideModMeta.json (rarity/polarity/drain per
// referenced mod) so the view's mod cards can never drift from the guide data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src", "data", "buildGuides.json");
const WFCD = path.join(ROOT, "node_modules", "@wfcd", "items", "data", "json");

function names(file) {
  const items = JSON.parse(fs.readFileSync(path.join(WFCD, file), "utf8"));
  return new Set(items.map((i) => i.name));
}

const modNames = names("Mods.json");
const arcaneNames = names("Arcanes.json");
const ITEM_POOLS = {
  warframe: names("Warframes.json"),
  primary: names("Primary.json"),
  secondary: names("Secondary.json"),
  melee: names("Melee.json"),
};
const ROLES = new Set(["dps", "support", "tank", "farm", "utility"]);

const guide = JSON.parse(fs.readFileSync(DATA, "utf8"));
const problems = [];
const seenBuildIds = new Set();

function nearMiss(name, pool) {
  const low = name.toLowerCase();
  for (const candidate of pool) {
    if (candidate.toLowerCase() === low) return candidate;
  }
  return null;
}

function checkName(kind, name, pool, where) {
  if (pool.has(name)) return;
  const suggestion = nearMiss(name, pool);
  problems.push(
    `${where}: ${kind} "${name}" veritabaninda yok` +
      (suggestion ? ` (kastedilen: "${suggestion}"?)` : ""),
  );
}

if (!Array.isArray(guide.items) || guide.items.length === 0) {
  problems.push("items bos veya dizi degil");
}

for (const entry of guide.items ?? []) {
  const ew = `item "${entry.item}"`;
  const pool = ITEM_POOLS[entry.type];
  if (!pool) {
    problems.push(`${ew}: type "${entry.type}" warframe/primary/secondary/melee olmali`);
    continue;
  }
  checkName(entry.type, entry.item, pool, ew);
  if (!Array.isArray(entry.builds) || entry.builds.length === 0) {
    problems.push(`${ew}: builds bos`);
    continue;
  }
  for (const build of entry.builds) {
    const bw = `${ew} / build "${build.id}"`;
    if (!build.id || seenBuildIds.has(build.id)) problems.push(`${bw}: id eksik veya tekrarli`);
    seenBuildIds.add(build.id);
    for (const key of ["name", "focus", "notesTr"]) {
      if (typeof build[key] !== "string" || !build[key]) problems.push(`${bw}: "${key}" eksik`);
    }
    if (!["general", "steelpath"].includes(build.focus)) {
      problems.push(`${bw}: focus "general" ya da "steelpath" olmali`);
    }
    if (!Array.isArray(build.roles) || build.roles.length === 0) {
      problems.push(`${bw}: roles en az bir eleman olmali`);
    }
    for (const role of build.roles ?? []) {
      if (!ROLES.has(role)) problems.push(`${bw}: role "${role}" taninmiyor (${[...ROLES]})`);
    }
    if (!Number.isInteger(build.forma) || build.forma < 0 || build.forma > 10) {
      problems.push(`${bw}: forma 0-10 arasi tamsayi olmali`);
    }
    if (entry.type === "warframe") {
      if (typeof build.aura === "string" && build.aura) checkName("aura", build.aura, modNames, bw);
      else problems.push(`${bw}: aura eksik`);
      if (build.exilus != null) checkName("exilus", build.exilus, modNames, bw);
      if (build.helminth != null) {
        if (
          typeof build.helminth.ability !== "string" ||
          typeof build.helminth.replaces !== "string"
        ) {
          problems.push(`${bw}: helminth { ability, replaces } alanlari string olmali`);
        }
      }
      if (build.stance != null) problems.push(`${bw}: warframe build'inde stance olamaz`);
    } else {
      for (const key of ["aura", "exilus", "helminth", "archonShards"]) {
        if (build[key] != null) problems.push(`${bw}: silah build'inde "${key}" olamaz`);
      }
      if (entry.type === "melee") {
        if (typeof build.stance === "string" && build.stance) {
          checkName("stance", build.stance, modNames, bw);
        } else {
          problems.push(`${bw}: melee build'inde stance gerekli`);
        }
      } else if (build.stance != null) {
        problems.push(`${bw}: stance sadece melee build'inde olabilir`);
      }
    }
    if (!Array.isArray(build.mods) || build.mods.length !== 8) {
      problems.push(`${bw}: mods tam 8 eleman olmali (su an ${build.mods?.length ?? 0})`);
    }
    for (const mod of build.mods ?? []) checkName("mod", mod, modNames, bw);
    for (const arcane of build.arcanes ?? []) checkName("arcane", arcane, arcaneNames, bw);
    if (!Array.isArray(build.sources) || build.sources.length === 0) {
      problems.push(`${bw}: en az bir kaynak URL gerekli`);
    }
  }
}

if (problems.length > 0) {
  console.error(`buildGuides.json dogrulama HATALI (${problems.length} sorun):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

// English notes live in a sibling map keyed by build id; every build must have
// one and the map may not carry ids the guide no longer has.
const NOTES_EN = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "buildGuideNotesEn.json"), "utf8"),
);
const noteIds = new Set(Object.keys(NOTES_EN));
for (const entry of guide.items ?? []) {
  for (const build of entry.builds ?? []) {
    if (typeof NOTES_EN[build.id] !== "string" || !NOTES_EN[build.id]) {
      problems.push(`build "${build.id}": buildGuideNotesEn.json icinde Ingilizce not eksik`);
    }
    noteIds.delete(build.id);
  }
}
for (const orphan of noteIds) {
  problems.push(
    `buildGuideNotesEn.json: "${orphan}" diye bir build yok (artik kaldirilmis olabilir)`,
  );
}

if (problems.length > 0) {
  console.error(`buildGuides dogrulama HATALI (${problems.length} sorun):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

const META_OUT = path.join(ROOT, "src", "data", "buildGuideModMeta.json");
const modsDb = JSON.parse(fs.readFileSync(path.join(WFCD, "Mods.json"), "utf8"));
const modsByName = new Map(modsDb.map((mod) => [mod.name, mod]));

const wanted = new Set();
for (const entry of guide.items) {
  for (const build of entry.builds) {
    for (const name of [build.aura, build.exilus, build.stance, ...build.mods]) {
      if (typeof name === "string" && name) wanted.add(name);
    }
  }
}

// Auras and stances carry a negative baseDrain because they add capacity; the
// sign is kept so the view can render "+7" instead of a drain figure.
function maxDrain(mod) {
  if (typeof mod.baseDrain !== "number" || typeof mod.fusionLimit !== "number") return null;
  return mod.baseDrain >= 0
    ? mod.baseDrain + mod.fusionLimit
    : -(Math.abs(mod.baseDrain) + mod.fusionLimit);
}

const meta = {};
for (const name of [...wanted].sort()) {
  const mod = modsByName.get(name);
  if (!mod) continue;
  meta[name] = {
    rarity: mod.rarity ?? "Common",
    polarity: mod.polarity ?? null,
    drain: maxDrain(mod),
  };
}
fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2) + "\n");

const buildCount = (guide.items ?? []).reduce((n, entry) => n + entry.builds.length, 0);
console.log(
  `buildGuides.json dogrulandi: ${guide.items.length} item, ${buildCount} build, tum adlar @wfcd/items ile eslesti`,
);
console.log(`buildGuideModMeta.json yenilendi: ${Object.keys(meta).length} mod`);
