// One-click selling from an inventory card: the same create-order dialog the
// order-book panel opens, minus the detour through the detail view.
import { get } from "svelte/store";

import { invoke } from "../ipc.js";
import { isIpcError } from "../ipcGuards.js";
import { tr } from "../i18n.js";
import { addToast } from "../../stores/toasts.js";
import { wfmItems } from "../../stores/data.js";
import { orderModalState } from "../../stores/market.js";
import { getLookupByName, type InventoryViewItem } from "../inventoryMarket.js";
import { toMarketSlug } from "../marketNaming.js";
import { sanitizeWfmSlug } from "../../../config/shared/wfm.js";
import {
  isRankedGroup,
  normalizeRankFilter,
  toFinitePositiveInt,
} from "../../../config/shared/numeric.js";
import type { WfmLookupItem } from "../../types/market.js";

function isLookupItem(row: unknown): row is WfmLookupItem {
  return (
    !!row &&
    typeof row === "object" &&
    typeof (row as { url_name?: unknown }).url_name === "string" &&
    ((row as { url_name: string }).url_name ?? "").trim().length > 0
  );
}

/** Opens the sell-order dialog for a card. Silently a no-op without a slug;
    the card hides the button in that case, so this is just the last guard. */
export async function openQuickSell(item: InventoryViewItem): Promise<void> {
  const translate = get(tr);
  if (!item.marketSlug) return;

  const session = await invoke("wfmGetSession");
  if (!session.loggedIn) {
    addToast({ level: "warning", message: translate("orderbook.signInFirst") });
    return;
  }

  const lookup = await invoke("wfmLookupItemBySlug", item.marketSlug);
  if (isIpcError(lookup) || !isLookupItem(lookup)) {
    addToast({ level: "error", message: translate("orderbook.prepareOrderFailed") });
    return;
  }

  const ranked = isRankedGroup(item.inventoryGroup);
  orderModalState.set({
    mode: "create",
    order: null,
    draft: {
      item: lookup,
      orderType: "sell",
      // The owned rank preselects the listing rank; the dialog can change it.
      modRank: ranked ? (normalizeRankFilter(item.rank) ?? 0) : null,
      maxRank: ranked ? normalizeRankFilter(item.maxRank) : null,
      subtype: item.subtype ?? null,
    },
  });
}

/** Opens a buy-order dialog for an item the inventory does not hold, resolved
    by its English name — the build guide's bridge for missing mods. */
export async function openQuickBuyByName(name: string): Promise<void> {
  const translate = get(tr);
  const lookupEntry = getLookupByName(name, get(wfmItems));
  const slug = lookupEntry?.url_name ? sanitizeWfmSlug(lookupEntry.url_name) : toMarketSlug(name);
  if (!slug) {
    addToast({ level: "error", message: translate("orderbook.prepareOrderFailed") });
    return;
  }

  const session = await invoke("wfmGetSession");
  if (!session.loggedIn) {
    addToast({ level: "warning", message: translate("orderbook.signInFirst") });
    return;
  }

  const lookup = await invoke("wfmLookupItemBySlug", slug);
  if (isIpcError(lookup) || !isLookupItem(lookup)) {
    addToast({ level: "error", message: translate("orderbook.prepareOrderFailed") });
    return;
  }

  const maxRank = toFinitePositiveInt(lookup.maxRank) ?? null;
  orderModalState.set({
    mode: "create",
    order: null,
    draft: {
      item: lookup,
      orderType: "buy",
      // Rank 0 is what buyers ask for by default; the dialog can raise it.
      modRank: maxRank != null ? 0 : null,
      maxRank,
      subtype: null,
    },
  });
}
