import { WORLD_STATE_CONFIG } from "../config/runtime/worldState";
import { fetchWithTimeout } from "../config/shared/fetchWithTimeout";
import { normalizeErrorMessage } from "../config/shared/errors";
import { withScope } from "./logger";

const log = withScope("worldStateFetch");

// Circuit breaker for api.warframestat.us: the community API goes down from
// time to time (Cloudflare 521s), and without a gate every refresh cycle
// hammers the dead host and spams the log with identical warnings. While the
// gate is closed its requests fail fast with a marker error the callers can
// swallow; only the open/close transitions are logged.
const WARFRAMESTAT_HOST = "warframestat.us";
const WARFRAMESTAT_PAUSED_MESSAGE = "warframestat.us paused by circuit breaker";
const BREAKER_BASE_BLOCK_MS = 5 * 60_000;
const BREAKER_MAX_BLOCK_MS = 30 * 60_000;
// Parallel requests of one refresh round fail together; count them as one.
const BREAKER_FAIL_WINDOW_MS = 10_000;

const breaker = {
  failedRounds: 0,
  lastFailureMs: 0,
  blockedUntilMs: 0,
};

/** True when the error only means the warframestat breaker is open. */
export function isWarframestatPaused(err: unknown): boolean {
  return err instanceof Error && err.message === WARFRAMESTAT_PAUSED_MESSAGE;
}

function noteWarframestatFailure(err: unknown): void {
  const nowMs = Date.now();
  if (nowMs - breaker.lastFailureMs <= BREAKER_FAIL_WINDOW_MS) {
    breaker.lastFailureMs = nowMs;
    return;
  }
  breaker.lastFailureMs = nowMs;
  breaker.failedRounds += 1;
  const blockMs = Math.min(
    BREAKER_BASE_BLOCK_MS * 2 ** (breaker.failedRounds - 1),
    BREAKER_MAX_BLOCK_MS,
  );
  breaker.blockedUntilMs = nowMs + blockMs;
  log.warn(
    `[WorldState] warframestat.us unreachable (${normalizeErrorMessage(err)}); ` +
      `pausing its requests for ${Math.round(blockMs / 60_000)} min`,
  );
}

function noteWarframestatSuccess(): void {
  if (breaker.failedRounds === 0) return;
  breaker.failedRounds = 0;
  breaker.blockedUntilMs = 0;
  log.info("[WorldState] warframestat.us reachable again");
}

export async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number = WORLD_STATE_CONFIG.cycleFetchTimeoutMs,
): Promise<unknown> {
  const isWarframestat = url.includes(WARFRAMESTAT_HOST);
  if (isWarframestat && Date.now() < breaker.blockedUntilMs) {
    throw new Error(WARFRAMESTAT_PAUSED_MESSAGE);
  }
  try {
    // The abort reason becomes the rejection, so a timed-out world-state fetch
    // logs "timeout" instead of the generic AbortError text.
    const resp = await fetchWithTimeout(
      url,
      timeoutMs,
      { headers: { Accept: "application/json" } },
      new Error("timeout"),
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const json = await resp.json();
    if (isWarframestat) noteWarframestatSuccess();
    return json;
  } catch (err) {
    if (isWarframestat) noteWarframestatFailure(err);
    throw err;
  }
}
