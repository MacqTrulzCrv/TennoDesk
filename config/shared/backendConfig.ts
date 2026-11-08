import { APP_PRODUCT_NAME } from "./appMeta";

/** Default backend Worker URL; renderer overrides via VITE_WFM_BACKEND_URL.
 *  CUTOVER to your own Cloudflare Worker: change this to your `<name>.<account>.
 *  workers.dev` (or custom-domain) URL - that one switch, plus ICON_MIRROR_BASE
 *  in config/shared/wfm.ts, moves the app off the upstream WFHelper servers.
 *  See the backend bağımsızlık planı for the full runbook. */
export const BACKEND_URL = "https://api.tennodesk.workers.dev";

export const BACKEND_CLIENT_HEADER = "x-wfhelper-client";

/** Whether the backend Worker serves live warframe.market prices (the /v1/prices,
 *  /v1/order-summary, /v1/meta and /v1/snapshot routes). FALSE for TennoDesk:
 *  warframe.market sits behind a Cloudflare bot challenge that 403s a Cloudflare
 *  Worker's egress, so the Worker cannot build a WFM price cache. Instead prices
 *  are fetched CLIENT-SIDE directly from warframe.market (the Electron app passes
 *  the challenge as a real browser), throttled and cached locally. Relic, world
 *  and static data still come from the Worker. See the backend bağımsızlık planı. */
export const BACKEND_SERVES_WFM_PRICES = false;

/** Identifies the build to the backend as `<product>/<version>`. The product comes
 *  from appMeta, so a fork keeping this backend announces its own name. */
export function backendClientHeader(version?: string | null): Record<string, string> {
  const normalized = (version || "").trim().replace(/^v/i, "");
  return { [BACKEND_CLIENT_HEADER]: `${APP_PRODUCT_NAME}/${normalized || "0.0.0"}` };
}
