import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No backendConfig mock here: this suite runs with the production default
// (BACKEND_SERVES_WFM_PRICES = false), so every price request must bypass the
// Worker and hit warframe.market directly. The backend-served path is covered
// separately in backendFallback.test.ts (which forces the flag on).

const BACKEND_URL = "https://backend.test";
const originalFetch = globalThis.fetch;

function toUrl(input: Request | URL | string): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function statsPayload(median: number): Record<string, unknown> {
  return {
    payload: {
      statistics_closed: {
        "48hours": [
          {
            order_type: "sell",
            datetime: new Date().toISOString(),
            wa_price: median,
            volume: 1,
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  // Backend is configured (relic/world data still use it) but must not be hit
  // for prices.
  vi.stubEnv("VITE_WFM_BACKEND_URL", BACKEND_URL);
  vi.stubEnv("VITE_WFM_BACKEND_BOOTSTRAP_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
});

describe("direct WFM prices (backend prices disabled)", () => {
  it("fetches the price straight from warframe.market, never the Worker", async () => {
    const fetchMock = vi.fn(async (input: Request | URL | string) => {
      const url = toUrl(input);
      if (url === "https://api.warframe.market/v1/items/ash_prime_blueprint/statistics") {
        return new Response(JSON.stringify(statsPayload(77)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchPriceBySlug } = await import("../../../../src/lib/wfm/wfmPrice.js");
    const result = await fetchPriceBySlug("ash_prime_blueprint", { priority: "normal" });

    expect(result).toMatchObject({ status: "ok", slug: "ash_prime_blueprint", median: 77 });
    // The Worker's /v1/prices route must never be called.
    for (const call of fetchMock.mock.calls) {
      expect(toUrl(call[0])).not.toContain(BACKEND_URL);
    }
  });

  it("caches a no_data result when warframe.market has no recent sales", async () => {
    const fetchMock = vi.fn(async (input: Request | URL | string) => {
      const url = toUrl(input);
      if (url.includes("/statistics")) {
        return new Response(JSON.stringify({ payload: { statistics_closed: { "48hours": [] } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchPriceBySlug } = await import("../../../../src/lib/wfm/wfmPrice.js");
    const result = await fetchPriceBySlug("obscure_item", { priority: "normal" });

    expect(result.status).toBe("no_data");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
