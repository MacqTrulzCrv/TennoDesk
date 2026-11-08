import { importCache, exportCache } from "./priceCache.js";
import { WFM_PRICE_BASIS } from "../../../config/shared/wfmStats.js";
import type { CachedPriceEntry } from "./priceCache.js";
import { importOrderSummaryCache } from "./orderSummaryCache.js";
import type { CachedOrderSummaryEntry } from "./orderSummaryCache.js";
import { importMetaFromSnapshot, importSetCatalogFromSnapshotMeta } from "./wfmItemMeta.js";
import type { WfmItemMeta } from "./wfmItemMeta.js";
import { fetchBackendRaw, isBackendLiteConfigured } from "./backendLite.js";
import { BACKEND_SERVES_WFM_PRICES } from "../../../config/shared/backendConfig.js";
import { schedulePriceCacheRevision } from "../../stores/pricing.js";
import { log } from "../log.js";
import { invoke } from "../ipc.js";
import {
  WFM_SNAPSHOT_CLIENT_CACHE_VERSION,
  isValidSnapshotBlob,
} from "../../../config/shared/wfmSnapshotValidation.js";

const SNAPSHOT_FRESH_MS = 2 * 60 * 60 * 1000;
const SNAPSHOT_FETCH_TIMEOUT_MS = 20_000;

// The ETag applies only to repeated loads in one renderer session; a fresh disk
// cache skips the network entirely.
let _cachedEtag: string | null = null;

// Object type alias (not interface) so it carries an implicit index signature
// and is assignable to the Record<string, unknown> IPC payload type without a cast.
type SnapshotBlob = {
  version: number;
  generatedAt: number;
  prices: Record<string, CachedPriceEntry>;
  meta: Record<string, WfmItemMeta>;
  orderSummaries: Record<string, CachedOrderSummaryEntry>;
};

function isValidSnapshot(d: unknown): d is SnapshotBlob {
  return isValidSnapshotBlob(d);
}

// Load a fresh disk snapshot or fetch one, then populate all in-memory caches.
// Failures are logged and do not reject startup.
export async function tryLoadSnapshot(): Promise<void> {
  if (!isBackendLiteConfigured()) return;
  // The Worker cannot build a WFM price snapshot (warframe.market blocks its
  // egress), so there is nothing to fetch. Instead restore the locally-persisted
  // client price cache; hydration fills the rest on demand and re-persists it.
  if (!BACKEND_SERVES_WFM_PRICES) {
    await loadClientPriceCacheFromDisk();
    return;
  }

  try {
    let snapshot: SnapshotBlob | null = null;
    let staleMeta: Record<string, WfmItemMeta> | undefined;

    // disk cache first
    try {
      const disk = await invoke("loadSnapshotCache");
      if (disk && isValidSnapshot(disk)) {
        if (
          Date.now() - disk.generatedAt < SNAPSHOT_FRESH_MS &&
          Object.values(disk.prices).every((price) => price.priceBasis === WFM_PRICE_BASIS)
        ) {
          snapshot = disk;
          log.info("[Snapshot] Using fresh disk cache");
        } else {
          staleMeta = disk.meta;
        }
      }
    } catch {
      // disk load failure is non-fatal - proceed to fetch
    }

    // disk miss or stale -> fetch from backend
    if (!snapshot) {
      const fetchHeaders: Record<string, string> = {};
      if (_cachedEtag) fetchHeaders["If-None-Match"] = _cachedEtag;

      const response = await fetchBackendRaw(
        `/v1/snapshot?client=${WFM_SNAPSHOT_CLIENT_CACHE_VERSION}`,
        {
          timeoutMs: SNAPSHOT_FETCH_TIMEOUT_MS,
          headers: {
            ...fetchHeaders,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          cache: "no-store",
        },
      );
      if (!response) {
        if (staleMeta) importSetCatalogFromSnapshotMeta(staleMeta);
        log.warn("[Snapshot] Fetch failed - skipping snapshot");
        return;
      }

      // 304 Not Modified: snapshot hasn't changed since the last fetch this session.
      if (response.status === 304) {
        log.info("[Snapshot] 304 Not Modified - snapshot unchanged, skipping re-import");
        return;
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        if (staleMeta) importSetCatalogFromSnapshotMeta(staleMeta);
        log.warn("[Snapshot] Failed to parse response JSON - skipping");
        return;
      }

      if (!isValidSnapshot(parsed)) {
        if (staleMeta) importSetCatalogFromSnapshotMeta(staleMeta);
        log.warn("[Snapshot] Invalid snapshot shape - skipping");
        return;
      }

      snapshot = parsed;

      // Store ETag for future conditional requests.
      const etag = response.headers.get("etag");
      if (etag) _cachedEtag = etag;

      // Persist to disk for next startup
      try {
        await invoke("saveSnapshotCache", snapshot);
      } catch {
        // non-fatal
      }
    }

    const pCount = importCache(snapshot.prices);
    const mCount = importMetaFromSnapshot(snapshot.meta);
    const oCount = importOrderSummaryCache(snapshot.orderSummaries);
    let sCount = importSetCatalogFromSnapshotMeta(snapshot.meta);
    if (sCount === 0 && staleMeta) sCount = importSetCatalogFromSnapshotMeta(staleMeta);
    const ageMins = Math.round((Date.now() - snapshot.generatedAt) / 60_000);

    log.info(
      `[Snapshot] Imported - prices: ${pCount}, meta: ${mCount}, ` +
        `orderSummaries: ${oCount}, sets: ${sCount} (age: ${ageMins} min)`,
    );

    // Signal reactive subscribers (e.g. RelicsView) that the price cache has
    // been bulk-updated so they re-evaluate cached lookups.
    if (pCount > 0 || oCount > 0) {
      schedulePriceCacheRevision();
    }
  } catch (err) {
    log.warn(
      "[Snapshot] Load failed - continuing without snapshot",
      err instanceof Error ? err : undefined,
    );
  }
}

// ── Client price cache disk persistence (direct-WFM mode) ───────────────────
// With the backend disabled for prices, the client fetches them itself; persist
// the cache so a restart shows prices instantly instead of re-fetching hundreds
// of items from warframe.market. The snapshot cache file is reused (prices only;
// meta and order summaries re-fetch on demand).
const PERSIST_INTERVAL_MS = 5 * 60 * 1000;
let _persistTimer: ReturnType<typeof setInterval> | null = null;

async function loadClientPriceCacheFromDisk(): Promise<void> {
  try {
    const disk = await invoke("loadSnapshotCache");
    if (disk && isValidSnapshot(disk)) {
      const count = importCache(disk.prices);
      if (count > 0) {
        // Log before signalling subscribers so a store-update hiccup cannot hide
        // the restore trace.
        log.info(`[PriceCache] Restored ${count} prices from disk`);
        schedulePriceCacheRevision();
      }
    }
  } catch (err) {
    // Non-fatal: hydration fetches prices on demand.
    log.warn("[PriceCache] Disk restore failed", err instanceof Error ? err : undefined);
  }
}

/** Flush the live client price cache to disk as a prices-only snapshot blob. */
export async function persistClientPriceCache(): Promise<void> {
  if (BACKEND_SERVES_WFM_PRICES) return;
  try {
    const prices = exportCache();
    if (Object.keys(prices).length === 0) return;
    const blob: SnapshotBlob = {
      version: 1,
      generatedAt: Date.now(),
      prices,
      meta: {},
      orderSummaries: {},
    };
    await invoke("saveSnapshotCache", blob);
  } catch {
    // Persistence is best-effort.
  }
}

/** Start periodic persistence plus a final flush on window unload. Idempotent. */
export function startClientPriceCachePersistence(): void {
  if (BACKEND_SERVES_WFM_PRICES || _persistTimer) return;
  // An early one-shot flush captures short sessions that close before the first
  // interval tick; the interval then keeps the on-disk copy current.
  setTimeout(() => void persistClientPriceCache(), 90_000);
  _persistTimer = setInterval(() => void persistClientPriceCache(), PERSIST_INTERVAL_MS);
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => void persistClientPriceCache());
  }
}
