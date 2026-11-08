import {
  fetchBackendOrderSummaryBySlug,
  type BackendFetchResult,
  type BackendOrderSummaryPayload,
} from "./backendLite.js";
import { BACKEND_SERVES_WFM_PRICES } from "../../../config/shared/backendConfig.js";
import { fetchItemOrderBookBySlug } from "./orderBook.js";
import { normalizeWfmSlug } from "../../../config/shared/wfm.js";
import { normalizeRankFilter } from "../../../config/shared/numeric.js";
import { rendererOrderBookCacheKey } from "../../../config/shared/wfmCacheKeys.js";
import {
  createCircuitBreaker,
  createConcurrencyLimiter,
  createSingleFlightMap,
} from "./requestPolicy.js";

const CIRCUIT_BREAKER_THRESHOLD = 6;
const CIRCUIT_BREAKER_COOLDOWN_MS = 90_000;
// Cap concurrent backend order-summary fetches so a cold page load with
// thousands of mods doesn't slam the worker with hundreds of parallel requests.
const MAX_CONCURRENT_FETCHES = 30;

const fetchLimiter = createConcurrencyLimiter(MAX_CONCURRENT_FETCHES);
const inFlightByKey = createSingleFlightMap<
  string,
  BackendFetchResult<BackendOrderSummaryPayload>
>();

interface OrderSummaryDebugCounters {
  requests: number;
  backendHitOk: number;
  backendHitNoData: number;
  backendError: number;
  breakerOpen: number;
}

const debugCounters: OrderSummaryDebugCounters = {
  requests: 0,
  backendHitOk: 0,
  backendHitNoData: 0,
  backendError: 0,
  breakerOpen: 0,
};

function bumpCounter(counter: keyof OrderSummaryDebugCounters): void {
  debugCounters[counter] += 1;
}

const breaker = createCircuitBreaker({
  threshold: CIRCUIT_BREAKER_THRESHOLD,
  cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
  onOpen: () => bumpCounter("breakerOpen"),
});

function getOrderSummaryCircuitState(): { open: boolean; retryAfterMs: number } {
  return breaker.state();
}

export function resetOrderSummaryDebugState(): void {
  breaker.reset();
  for (const key of Object.keys(debugCounters) as Array<keyof OrderSummaryDebugCounters>) {
    debugCounters[key] = 0;
  }
}

// When the Worker cannot serve WFM prices, derive the {wts, wtb} summary from a
// direct warframe.market order-book fetch (reuses orderBook.ts: live v2/v1 orders,
// its own 4-way concurrency throttle and 45s cache). The best sell is the lowest
// online ask, the best buy the highest online bid, both per-unit.
async function fetchDirectOrderSummary(
  slug: string,
  rank: number | null,
  subtype: string | null,
): Promise<BackendFetchResult<BackendOrderSummaryPayload>> {
  const book = await fetchItemOrderBookBySlug(slug, { rank, subtype, priority: "background" });
  if (book.status === "ok") {
    const wtsUnit = book.data.sell[0]?.unitPlatinum ?? null;
    const wtbUnit = book.data.buy[0]?.unitPlatinum ?? null;
    return {
      status: "ok",
      data: {
        slug: book.data.slug,
        rank,
        wts: wtsUnit != null ? Math.round(wtsUnit) : null,
        wtb: wtbUnit != null ? Math.round(wtbUnit) : null,
        timestamp: book.data.timestamp,
      },
    };
  }
  if (book.status === "not_found") return { status: "not_found" };
  return { status: "unavailable" };
}

export async function fetchOrderSummaryBySlug(
  slugInput: string | null | undefined,
  options?: { rank?: number | null; subtype?: string | null },
): Promise<BackendFetchResult<BackendOrderSummaryPayload>> {
  const slug = normalizeWfmSlug(slugInput);
  if (!slug) return { status: "not_found" };

  bumpCounter("requests");
  const rank = normalizeRankFilter(options?.rank ?? null);
  const subtype =
    typeof options?.subtype === "string" && options.subtype.trim()
      ? options.subtype.trim().toLowerCase()
      : null;
  const baseKey = rendererOrderBookCacheKey(slug, rank);
  const requestKey = subtype ? `${baseKey}:st-${subtype}` : baseKey;

  const inFlight = inFlightByKey.get(requestKey);
  if (inFlight) return inFlight;

  const circuit = getOrderSummaryCircuitState();
  if (circuit.open) {
    bumpCounter("backendError");
    return { status: "unavailable" } as const;
  }

  return inFlightByKey.run(requestKey, async () => {
    await fetchLimiter.acquire();
    try {
      const result = BACKEND_SERVES_WFM_PRICES
        ? await fetchBackendOrderSummaryBySlug(slug, { rank, subtype })
        : await fetchDirectOrderSummary(slug, rank, subtype);
      if (result.status === "ok") {
        breaker.noteSuccess();
        bumpCounter("backendHitOk");
        return result;
      }

      if (result.status === "not_found") {
        breaker.noteSuccess();
        bumpCounter("backendHitNoData");
        return result;
      }

      breaker.noteFailure();
      bumpCounter("backendError");
      return result.status === "error" ? ({ status: "unavailable" } as const) : result;
    } finally {
      fetchLimiter.release();
    }
  });
}
