import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Direct-WFM mode (BACKEND_SERVES_WFM_PRICES = false, the production default):
// the client fetches prices itself and persists them to the snapshot cache file
// so a restart shows prices instantly. No backendConfig mock here on purpose.
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../../../../src/lib/ipc.js", () => ({ invoke: mocks.invoke }));
vi.mock("../../../../src/lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../../src/lib/wfm/backendLite.js", () => ({
  fetchBackendRaw: vi.fn(),
  isBackendLiteConfigured: () => true,
}));
vi.mock("../../../../src/stores/pricing.js", () => ({ schedulePriceCacheRevision: vi.fn() }));

import { WFM_PRICE_BASIS } from "../../../../config/shared/wfmStats.js";

beforeEach(() => {
  vi.resetModules();
  mocks.invoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client price cache persistence (direct-WFM mode)", () => {
  it("restores prices from disk on load without fetching a backend snapshot", async () => {
    const now = Date.now();
    mocks.invoke.mockImplementation(async (channel: string) => {
      if (channel === "loadSnapshotCache") {
        return {
          version: 1,
          generatedAt: now,
          prices: {
            ash_prime_set: {
              status: "ok",
              median: 42,
              timestamp: now,
              priceBasis: WFM_PRICE_BASIS,
            },
          },
          meta: {},
          orderSummaries: {},
        };
      }
      return null;
    });

    const { tryLoadSnapshot } = await import("../../../../src/lib/wfm/snapshotLoader.js");
    const { getCachedPriceState } = await import("../../../../src/lib/wfm/priceCache.js");

    await tryLoadSnapshot();

    expect(getCachedPriceState("ash_prime_set")).toMatchObject({ status: "ok", median: 42 });
    expect(mocks.invoke).toHaveBeenCalledWith("loadSnapshotCache");
    expect(mocks.invoke).not.toHaveBeenCalledWith("saveSnapshotCache", expect.anything());
  });

  it("persists the live price cache as a prices-only snapshot blob", async () => {
    mocks.invoke.mockResolvedValue(undefined);

    const { setCachedPrice } = await import("../../../../src/lib/wfm/priceCache.js");
    const { persistClientPriceCache } = await import("../../../../src/lib/wfm/snapshotLoader.js");

    setCachedPrice("volt_prime_set", 30);
    await persistClientPriceCache();

    const saveCall = mocks.invoke.mock.calls.find((c) => c[0] === "saveSnapshotCache");
    expect(saveCall).toBeTruthy();
    const blob = saveCall?.[1] as {
      version: number;
      prices: Record<string, { status: string; median: number }>;
      meta: Record<string, unknown>;
      orderSummaries: Record<string, unknown>;
    };
    expect(blob.version).toBe(1);
    expect(blob.prices.volt_prime_set).toMatchObject({ status: "ok", median: 30 });
    expect(blob.meta).toEqual({});
    expect(blob.orderSummaries).toEqual({});
  });
});
