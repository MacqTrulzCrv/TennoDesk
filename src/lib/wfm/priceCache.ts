import { isCacheEntryFresh } from "../../../config/shared/numeric.js";
import { WFM_PRICE_BASIS } from "../../../config/shared/wfmStats.js";

// Client-fetched prices (direct from warframe.market) are refreshed on a 12h
// freshness window: an entry older than this is dropped so hydration re-fetches.
const PRICE_TTL_MS = 12 * 60 * 60 * 1000;
const NO_DATA_TTL_MS = 12 * 60 * 60 * 1000;

type CachedPriceStatus = "ok" | "no_data";

export interface CachedPriceEntry {
  status: CachedPriceStatus;
  median: number | null;
  timestamp: number;
  priceBasis?: string;
}

const _prices = new Map<string, CachedPriceEntry>();

function isFresh(entry: CachedPriceEntry): boolean {
  return isCacheEntryFresh(entry, PRICE_TTL_MS, NO_DATA_TTL_MS);
}

export function getCachedPriceState(slug: string): CachedPriceEntry | null {
  const entry = _prices.get(slug);
  if (!entry) return null;
  if (!isFresh(entry)) {
    _prices.delete(slug);
    return null;
  }
  return entry;
}

export function setCachedPrice(slug: string, median: number): void {
  _prices.set(slug, { status: "ok", median, timestamp: Date.now(), priceBasis: WFM_PRICE_BASIS });
}

export function setCachedNoData(slug: string): void {
  _prices.set(slug, {
    status: "no_data",
    median: null,
    timestamp: Date.now(),
    priceBasis: WFM_PRICE_BASIS,
  });
}

function clearPriceCache(): void {
  _prices.clear();
}

/** Bulk-import entries from the snapshot cache. Only fresh entries are kept. */
export function importCache(data: Record<string, CachedPriceEntry>): number {
  let imported = 0;
  for (const [slug, entry] of Object.entries(data)) {
    if (
      entry &&
      entry.priceBasis === WFM_PRICE_BASIS &&
      typeof entry.timestamp === "number" &&
      typeof entry.status === "string" &&
      isFresh(entry)
    ) {
      const existing = _prices.get(slug);
      if (existing && existing.timestamp >= entry.timestamp) {
        continue;
      }

      _prices.set(slug, entry);
      imported++;
    }
  }
  return imported;
}

/** Snapshot every in-memory entry so the client price cache can be persisted to
 *  disk and restored on the next launch (avoids re-fetching from WFM each start). */
export function exportCache(): Record<string, CachedPriceEntry> {
  return Object.fromEntries(_prices);
}

export const __test__ = {
  clearPriceCache,
};
