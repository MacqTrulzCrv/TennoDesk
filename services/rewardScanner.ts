import fs from "node:fs";
import { withScope } from "./logger";
import { createEraOcr, createRewardOcrRunner } from "./rewardScannerOcr";
import { recognizeRewardStripOnnx, rewardOcrOnnxAvailable } from "./rewardOcrOnnx";
import { SCANNER_TUNING } from "./rewardScannerSupport";
import { detectRelicSelectionEra as detectRelicSelectionEraWithOcr } from "./rewardScannerEra";
import {
  resetFrameDedup,
  runRewardScanPipeline,
  type PreCaptureResult,
  type RewardScanSettings,
} from "./rewardScannerPipeline";
import type { SortedItem } from "./rewardScannerMatch";
import type { RewardReader } from "./rewardScannerSlotScan";
import { localizedNameFields } from "./itemDatabase";
import { REFERENCE_WARFRAME_UI_SCALE } from "../config/runtime/overlaySettings";

export { captureSourceMeta } from "./screenCapture";
export { resetFrameDedup };

const log = withScope("rewardScanner");

const REWARD_SCAN_SETTINGS: RewardScanSettings = Object.freeze({
  cropPreset: "balanced",
  ocrPasses: 2,
  matchThreshold: 0.74,
  ocrTimeoutMs: 15_000,
});

const { runOCR, runOCRBuffer, runOCRStructuredBuffer } = createRewardOcrRunner({
  log,
  getRequestedEngine: () => "windows",
  ocrScriptPath: SCANNER_TUNING.paths.ocrScript,
  engineWindows: "windows",
});

let relicItems: SortedItem[] = [];
let sortedItems: SortedItem[] = [];

export function setRelicItems(items: SortedItem[]): void {
  const base = Array.isArray(items) ? items : [];
  // A localized client prints the game-language name on the card, so each item
  // whose localized spelling differs joins the pool again under that spelling;
  // canonicalName carries the English join key back out of the scan.
  const expanded: SortedItem[] = [];
  for (const item of base) {
    expanded.push(item);
    const uniqueName = typeof item.uniqueName === "string" ? item.uniqueName : null;
    const { displayName } = localizedNameFields(uniqueName, item.name);
    if (displayName && displayName !== item.name) {
      expanded.push({ ...item, name: displayName, canonicalName: item.name });
    }
  }
  relicItems = expanded;
  sortedItems = [...relicItems].sort((a, b) => b.name.length - a.name.length);
  const aliases = expanded.length - base.length;
  log.info(
    `[RewardScanner] Item list updated: ${base.length} items` +
      (aliases > 0 ? ` (+${aliases} localized aliases)` : ""),
  );
}

const eraOcr = createEraOcr({
  runOCR,
  runOCRBuffer,
  recognizeStrip: recognizeRewardStripOnnx,
  stripAvailable: rewardOcrOnnxAvailable,
  readFile: (imagePath) => fs.readFileSync(imagePath),
});

export function detectRelicSelectionEra(
  options: { timeoutMs?: number; preferredDisplayId?: string | null; labelOnly?: boolean } = {},
): ReturnType<typeof detectRelicSelectionEraWithOcr> {
  return detectRelicSelectionEraWithOcr(options, eraOcr, REWARD_SCAN_SETTINGS);
}

export async function scanRewardsDetailed(
  preCapture?: PreCaptureResult | null,
  scanOptions?: { reader?: RewardReader; warframeUiScale?: number },
): Promise<{
  items: SortedItem[];
  meta: Record<string, unknown>;
} | null> {
  if (sortedItems.length === 0) {
    log.warn("[RewardScanner] No relic items loaded - call setRelicItems() first");
    return null;
  }

  const result = await runRewardScanPipeline({
    preCapture,
    sortedItems,
    settings: {
      ...REWARD_SCAN_SETTINGS,
      warframeUiScale: scanOptions?.warframeUiScale ?? REFERENCE_WARFRAME_UI_SCALE,
    },
    runOCRStructuredBuffer,
    // Windows OCR does not exist off-Windows; pin the cross-platform onnx reader.
    reader: process.platform === "win32" ? scanOptions?.reader : "onnx",
  });
  if (!result) return result;
  // Every consumer joins on the English name, so an alias hit hands back its
  // canonical spelling before it leaves the scanner.
  return {
    ...result,
    items: result.items.map((item) =>
      typeof item.canonicalName === "string" && item.canonicalName
        ? { ...item, name: item.canonicalName }
        : item,
    ),
  };
}
