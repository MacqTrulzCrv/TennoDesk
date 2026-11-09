import { app } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Equipment names that have a curated build guide. Read from the same JSON the
// renderer renders (packaged via package.json build.files) so the reward overlay
// can flag "has a guide" rewards without the renderer in the loop. Memoised.
let cached: ReadonlySet<string> | null = null;

export function buildGuideItemNames(): ReadonlySet<string> {
  if (cached) return cached;
  try {
    const path = join(app.getAppPath(), "src", "data", "buildGuides.json");
    const data = JSON.parse(readFileSync(path, "utf8")) as { items?: { item?: unknown }[] };
    const names = (data.items ?? [])
      .map((entry) => entry.item)
      .filter((name): name is string => typeof name === "string");
    cached = new Set(names);
  } catch {
    cached = new Set();
  }
  return cached;
}
