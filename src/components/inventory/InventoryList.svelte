<script lang="ts">
  import {
    showFoundryReadyBadges,
    showMasteredBadges,
    showOwnedParentBadges,
    showVaultedBadges,
  } from "../../stores/preferences.js";
  import { onDestroy } from "svelte";

  import ArchonShardPips from "../archon/ArchonShardPips.svelte";
  import ItemImage from "../ItemImage.svelte";
  import WikiButton from "../WikiButton.svelte";
  import SortHeaderButton from "../SortHeaderButton.svelte";
  import { send } from "../../lib/ipc.js";
  import { toOfficialWikiUrl, buildWikiUrl } from "../../lib/wikiUrl.js";
  import { openQuickSell } from "../../lib/inventory/quickSell.js";
  import { addToast } from "../../stores/toasts.js";
  import { NAV_ICON_URLS } from "../../lib/assetUrls.js";
  import { archonShardsBySuit } from "../../stores/archonShards.js";
  // Aliased: a store named `tr` makes svelte-check flag every <tr> row as a lowercase component.
  import { locale, tr as t } from "../../lib/i18n.js";
  import { nextColumnSort } from "../../lib/filters.js";
  import { itemLabel } from "../../lib/itemLabel.js";
  import { INVENTORY_LIST_COLUMNS, ownedSortKeyFor } from "./inventoryListColumns.js";
  import { itemMarksFor } from "../../lib/parentMastery.js";
  import { wfmItems } from "../../stores/data.js";
  import {
    inventorySafetyVerdicts,
    showsSafetyBadge,
    verdictFor,
  } from "../../stores/inventorySafety.js";
  import type { InventoryViewItem } from "../../lib/inventoryMarket.js";
  import type { SharedSortKey, SortDirection } from "../../types/filters.js";
  import { isRankedGroup } from "../../../config/shared/numeric.js";

  interface Props {
    items: InventoryViewItem[];
    totalCount: number | null;
    allItems?: InventoryViewItem[] | null;
    showDucats: boolean;
    detailKeys: Set<string> | null;
    sortBy: SharedSortKey;
    sortDirection: SortDirection;
    sortableKeys: ReadonlySet<string>;
    onSort: (patch: { sortBy: SharedSortKey; sortDirection: SortDirection }) => void;
    onSelect: (item: InventoryViewItem) => void;
    onExpand: (item: InventoryViewItem) => void;
    onVisible: (item: InventoryViewItem) => void;
    onMore: () => void;
    selectionMode?: boolean;
    selectedKeys?: ReadonlySet<string> | null;
    eligibleKeys?: ReadonlySet<string> | null;
    onToggleSelect?: (item: InventoryViewItem, shiftKey: boolean) => void;
    hasActiveFilters?: boolean;
    onClearFilters?: (() => void) | null;
  }

  let {
    items,
    totalCount,
    allItems = null,
    showDucats,
    detailKeys,
    sortBy,
    sortDirection,
    sortableKeys,
    onSort,
    onSelect,
    onExpand,
    onVisible,
    onMore,
    selectionMode = false,
    selectedKeys = null,
    eligibleKeys = null,
    onToggleSelect = () => {},
    hasActiveFilters = false,
    onClearFilters = null,
  }: Props = $props();

  const columns = $derived(
    INVENTORY_LIST_COLUMNS.filter((column) => showDucats || column.key !== "ducats"),
  );

  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const rowItems = new Map<Element, InventoryViewItem>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const reportedVisible = new Set<string>();
  const visibilityObserver: IntersectionObserver | null =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const item = rowItems.get(entry.target);
              if (!item || reportedVisible.has(item.internalName)) continue;
              reportedVisible.add(item.internalName);
              visibilityObserver?.unobserve(entry.target);
              onVisible(item);
            }
          },
          { root: null, rootMargin: "160px 0px 240px 0px", threshold: 0.01 },
        );

  onDestroy(() => {
    visibilityObserver?.disconnect();
    rowItems.clear();
  });

  let catalogSeen = false;
  $effect(() => {
    if (catalogSeen || Object.keys($wfmItems).length === 0) return;
    catalogSeen = true;
    reportedVisible.clear();
    for (const node of rowItems.keys()) visibilityObserver?.observe(node);
  });

  function trackRow(
    node: HTMLElement,
    item: InventoryViewItem,
  ): { update: (next: InventoryViewItem) => void; destroy: () => void } {
    rowItems.set(node, item);
    if (!reportedVisible.has(item.internalName)) visibilityObserver?.observe(node);
    return {
      update(next: InventoryViewItem): void {
        rowItems.set(node, next);
      },
      destroy(): void {
        rowItems.delete(node);
        visibilityObserver?.unobserve(node);
      },
    };
  }

  function observeMore(node: HTMLElement): { destroy: () => void } {
    if (typeof IntersectionObserver === "undefined") return { destroy: () => {} };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  const ownedSortKey = $derived(
    ownedSortKeyFor((allItems ?? items).map((item) => item.inventoryGroup)),
  );

  const columnSortKeys = $derived(
    columns.map((column): SharedSortKey | null => {
      const sortKey = column.key === "owned" ? ownedSortKey : column.sortKey;
      return sortKey && sortableKeys.has(sortKey) ? sortKey : null;
    }),
  );

  function sortByColumn(sortKey: SharedSortKey): void {
    onSort(nextColumnSort({ sortBy, sortDirection }, sortKey));
  }

  function openRow(item: InventoryViewItem, event?: MouseEvent | KeyboardEvent): void {
    if (selectionMode) {
      if (isSelectable(item)) onToggleSelect(item, event?.shiftKey === true);
      return;
    }
    if (!detailKeys || detailKeys.has(item.internalName)) onExpand(item);
    else onSelect(item);
  }

  function isSelectable(item: InventoryViewItem): boolean {
    return eligibleKeys?.has(item.internalName) ?? false;
  }

  // Keyboard cursor over the rows: j/k move it, Enter opens, x quick-sells.
  // Kept null until the first keypress so the highlight never appears unasked.
  let focusedIndex = $state<number | null>(null);

  // A shrinking list (filter, search) must not strand the cursor past the end.
  $effect(() => {
    if (focusedIndex === null) return;
    if (items.length === 0) focusedIndex = null;
    else if (focusedIndex > items.length - 1) focusedIndex = items.length - 1;
  });

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true
    );
  }

  function scrollFocusedIntoView(): void {
    const key = focusedIndex === null ? null : items[focusedIndex]?.internalName;
    if (!key) return;
    document
      .querySelector<HTMLElement>(`[data-list-row="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function moveFocus(delta: number): void {
    if (items.length === 0) return;
    const start = focusedIndex ?? (delta > 0 ? -1 : 0);
    focusedIndex = Math.max(0, Math.min(items.length - 1, start + delta));
    queueMicrotask(scrollFocusedIntoView);
  }

  function onListKeyDown(event: KeyboardEvent): void {
    // A modal, the command palette, or a text field owns the keyboard first.
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return;

    if (event.key === "j") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "k") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Escape" && focusedIndex !== null) {
      focusedIndex = null;
    } else if (focusedIndex !== null) {
      const item = items[focusedIndex];
      if (!item) return;
      if (event.key === "Enter") {
        event.preventDefault();
        openRow(item);
      } else if ((event.key === "x" || event.key === "X") && item.marketSlug) {
        event.preventDefault();
        void openQuickSell(item);
      }
    }
  }

  $effect(() => {
    window.addEventListener("keydown", onListKeyDown);
    return () => window.removeEventListener("keydown", onListKeyDown);
  });

  function ownedLabel(item: InventoryViewItem, code: string): string {
    if (item.inventoryGroup === "incomplete_sets") {
      return `${item.ownedPartTypes ?? 0}/${item.totalPartTypes ?? 0}`;
    }
    return (item.amount ?? 0).toLocaleString(code);
  }

  function numberLabel(value: number | null | undefined, code: string): string {
    return typeof value === "number" ? value.toLocaleString(code) : "-";
  }

  function showsRank(item: InventoryViewItem): boolean {
    return isRankedGroup(item.inventoryGroup) && item.maxRank > 1;
  }

  function isMaxRank(item: InventoryViewItem): boolean {
    return item.maxRank > 1 && item.rank >= item.maxRank;
  }

  // One row open at a time keeps the table short; a Set would let several sprawl.
  let expandedKey = $state<string | null>(null);
  // Right-click menu — a fixed-position panel anchored at the pointer.
  let menu = $state<{ item: InventoryViewItem; x: number; y: number } | null>(null);
  const MENU_W = 208;
  const MENU_H = 168;

  // Column count for the detail row's colspan: the visible data columns plus the
  // leading checkbox column when selecting.
  const colSpan = $derived(columns.length + (selectionMode ? 1 : 0));

  function toggleExpand(item: InventoryViewItem, event: MouseEvent): void {
    event.stopPropagation();
    expandedKey = expandedKey === item.internalName ? null : item.internalName;
  }

  function openWiki(item: InventoryViewItem): void {
    send(
      "open-external",
      item.wikiaUrl ? toOfficialWikiUrl(item.wikiaUrl) : buildWikiUrl(item.name),
    );
  }

  async function copyName(item: InventoryViewItem): Promise<void> {
    const label = itemLabel(item);
    try {
      await navigator.clipboard.writeText(label);
      addToast({ level: "success", message: $t("common.copied") });
    } catch {
      addToast({ level: "error", message: $t("common.copyFailed") });
    }
  }

  function openMenu(event: MouseEvent, item: InventoryViewItem): void {
    if (selectionMode) return;
    event.preventDefault();
    menu = {
      item,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_W)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - MENU_H)),
    };
  }

  function runMenu(action: (item: InventoryViewItem) => void): void {
    const item = menu?.item;
    menu = null;
    if (item) action(item);
  }
</script>

<svelte:window
  onclick={() => (menu = null)}
  onkeydown={(event) => {
    if (event.key === "Escape") menu = null;
  }}
/>

<div class="inventory-list" data-inventory-list>
  {#if items.length === 0}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <p>{hasActiveFilters ? $t("inventory.emptyFiltered") : $t("inventory.noItemsFound")}</p>
      {#if hasActiveFilters && onClearFilters}
        <button
          type="button"
          class="mt-1 rounded border border-border px-3 py-1 font-display text-sm text-text-secondary transition-colors hover:border-accent-dim hover:text-accent"
          data-inventory-clear-filters
          onclick={onClearFilters}
        >
          {$t("common.clearFilters")}
        </button>
      {/if}
    </div>
  {:else}
    <!-- Chromium paints a collapsed table's borders on the table, so a sticky header's bottom rule scrolls away from it. -->
    <table class="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr class="text-left text-xs tracking-wide text-text-muted uppercase">
          {#if selectionMode}
            <th class="w-8 border-b border-border bg-bg-base px-2 py-2">
              <span class="sr-only">{$t("inventory.selectMode")}</span>
            </th>
          {/if}
          {#each columns as column, columnIndex (column.key)}
            {@const sortKey = columnSortKeys[columnIndex] ?? null}
            {@const active = sortKey !== null && sortBy === sortKey}
            <th
              class="border-b border-border bg-bg-base px-2 py-2 font-semibold {column.numeric
                ? 'text-right'
                : 'text-left'} {column.key === 'icon' ? 'w-10' : ''}"
              data-list-column={column.key}
              aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              {#if column.labelKey === null}
                <span class="sr-only">{$t("common.item")}</span>
              {:else if sortKey === null}
                {$t(column.labelKey)}
              {:else}
                <SortHeaderButton
                  label={$t(column.labelKey)}
                  {active}
                  direction={sortDirection}
                  alignEnd={column.numeric}
                  data-list-sort={sortKey}
                  onclick={() => sortByColumn(sortKey)}
                />
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each items as item, rowIndex (item.internalName)}
          {@const shardCopies =
            $archonShardsBySuit.get(item.uniqueName || item.internalName || "") ?? []}
          {@const selected = selectedKeys?.has(item.internalName) ?? false}
          {@const marks = itemMarksFor(item)}
          {@const verdict = verdictFor(item, $inventorySafetyVerdicts)}
          {@const reserved = showsSafetyBadge(item, verdict) ? verdict : null}
          {@const safeTitle = reserved
            ? [
                $t("inventory.safety.safeCount", { count: reserved.safe }),
                ...reserved.reservations.map((entry) => $t(entry.reasonKey, entry.params)),
              ].join("\n")
            : ""}
          <tr
            class="group cursor-pointer transition-colors duration-100 hover:bg-bg-raised {selected
              ? 'bg-accent/15'
              : ''} {rowIndex === focusedIndex
              ? 'bg-accent/10 shadow-[inset_2px_0_0_0_var(--view-accent)]'
              : ''} {selectionMode && !isSelectable(item) ? 'opacity-45' : ''}"
            data-list-row={item.internalName}
            data-list-focused={rowIndex === focusedIndex || undefined}
            use:trackRow={item}
            onclick={(event) => openRow(item, event)}
            oncontextmenu={(event) => openMenu(event, item)}
          >
            {#if selectionMode}
              <td class="border-b border-border/50 px-2 py-1">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!isSelectable(item)}
                  data-inventory-select-item={item.internalName}
                  title={isSelectable(item) ? undefined : $t("inventory.notSellable")}
                  aria-label={$t("inventory.selectItem", { name: itemLabel(item) })}
                  onclick={(event) => {
                    event.stopPropagation();
                    if (isSelectable(item)) onToggleSelect(item, event.shiftKey);
                  }}
                />
              </td>
            {/if}
            <td class="border-b border-border/50 px-2 py-1">
              <span
                class="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-border/60 bg-surface-card"
              >
                <ItemImage
                  src={item.displayImageUrl}
                  fallbackSrc={item.imageUrl !== item.displayImageUrl ? item.imageUrl : null}
                  alt={itemLabel(item)}
                  auditKey={item.name}
                  cls="max-h-7 max-w-7 object-contain"
                />
              </span>
            </td>
            <td class="border-b border-border/50 px-2 py-1">
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <button
                    type="button"
                    class="block text-left font-semibold hover:text-accent {item.isPrime
                      ? 'text-accent'
                      : 'text-text-primary'}"
                    aria-label={$t("common.openDetailsFor", { name: itemLabel(item) })}
                    onclick={(event) => {
                      event.stopPropagation();
                      openRow(item, event);
                    }}
                  >
                    {itemLabel(item)}
                  </button>
                  <span class="flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
                    <span>{item.categoryLabel}</span>
                    {#if $showVaultedBadges && item.vaulted}<span
                        class="vault-badge vault-badge--inline"
                        title={$t("common.vaulted")}>V</span
                      >{/if}
                    {#if $showMasteredBadges && marks.mastered}<span
                        class="detail-tag mastered"
                        data-item-mark="mastered"
                        title={$t("common.mastered")}>{$t("common.mastered")}</span
                      >{/if}
                    {#if $showOwnedParentBadges && marks.crafted}<span
                        class="detail-tag crafted"
                        data-item-mark="crafted"
                        title={$t("common.parentItemOwned")}>{$t("common.parentOwned")}</span
                      >{/if}
                    {#if $showFoundryReadyBadges && marks.foundry}<span
                        class="detail-tag foundry"
                        data-item-mark="foundry"
                        title={$t("common.parentReadyToClaim")}>F</span
                      >{/if}
                    {#each shardCopies as copy, copyIndex (copy.instanceId ?? copyIndex)}
                      <ArchonShardPips
                        slots={copy.slots}
                        title={copy.filled === 1
                          ? $t("archon.shardCountOne", { count: copy.filled })
                          : $t("archon.shardCount", { count: copy.filled })}
                      />
                    {/each}
                  </span>
                </div>
                <div
                  class="flex shrink-0 items-center gap-0.5 self-center transition-opacity {expandedKey ===
                  item.internalName
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}"
                >
                  {#if item.marketSlug}
                    <button
                      type="button"
                      class="rounded p-1 text-text-muted transition-colors hover:text-success"
                      data-list-quick-sell={item.internalName}
                      title={$t("inventory.quickSell")}
                      aria-label={$t("inventory.quickSell")}
                      onclick={(event) => {
                        event.stopPropagation();
                        void openQuickSell(item);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path
                          d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                        />
                        <circle cx="7" cy="7" r="1.2" fill="currentColor" />
                      </svg>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="rounded p-1 text-text-muted transition-colors hover:text-accent"
                    data-list-expand={item.internalName}
                    aria-expanded={expandedKey === item.internalName}
                    title={$t("common.details")}
                    aria-label={$t("common.openDetailsFor", { name: itemLabel(item) })}
                    onclick={(event) => toggleExpand(item, event)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="transition-transform duration-200 {expandedKey === item.internalName
                        ? 'rotate-180'
                        : ''}"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            </td>
            <td
              class="border-b border-border/50 px-2 py-1 text-right font-semibold text-success tabular-nums"
            >
              {ownedLabel(item, $locale)}{#if reserved}<span
                  class="ml-1 text-xs text-warning"
                  data-safe-to-sell={reserved.safe}
                  title={safeTitle}>({reserved.safe})</span
                >{/if}
            </td>
            <td class="border-b border-border/50 px-2 py-1 text-xs whitespace-nowrap">
              {#if showsRank(item)}
                <span
                  class="tabular-nums {isMaxRank(item) ? 'text-success' : 'text-text-secondary'}"
                  >{item.rank}/{item.maxRank}</span
                >
              {:else if item.parentMastered === true || isMaxRank(item)}
                <span class="text-success">{$t("common.mastered")}</span>
              {:else if item.parentMastered === false}
                <span class="text-text-muted">{$t("common.notMastered")}</span>
              {:else}
                <span class="text-text-muted">-</span>
              {/if}
            </td>
            <td
              class="border-b border-border/50 px-2 py-1 text-right tabular-nums {item.displayPlatinum ==
              null
                ? 'text-text-muted'
                : 'text-accent-bright'}"
            >
              {numberLabel(item.displayPlatinum, $locale)}
            </td>
            {#if showDucats}
              <td
                class="border-b border-border/50 px-2 py-1 text-right tabular-nums {item.ducats ==
                null
                  ? 'text-text-muted'
                  : 'text-accent'}"
              >
                {numberLabel(item.ducats, $locale)}
              </td>
            {/if}
            <td class="border-b border-border/50 px-2 py-1">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent"
                data-list-order-state={item.orderPlaced ? "listed" : "unlisted"}
                title={item.orderPlaced ? $t("inventory.listedOnWfm") : $t("browse.tabOrders")}
                aria-label={item.orderPlaced ? $t("inventory.listedOnWfm") : $t("browse.tabOrders")}
                onclick={(event) => {
                  event.stopPropagation();
                  if (selectionMode) openRow(item, event);
                  else onSelect(item);
                }}
              >
                {#if item.orderPlaced}
                  <img src={NAV_ICON_URLS.market} alt="" class="h-3.5 w-3.5" />
                {:else}
                  <span aria-hidden="true">-</span>
                {/if}
              </button>
            </td>
          </tr>
          {#if expandedKey === item.internalName}
            <tr data-list-detail={item.internalName}>
              <td colspan={colSpan} class="border-b border-border/50 bg-bg-soft px-2 py-2">
                <div
                  class="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-accent/40 pl-3 text-xs"
                >
                  <span class="text-text-muted">{item.categoryLabel}</span>
                  {#if item.inventoryGroup === "incomplete_sets"}
                    <span class="text-text-secondary">
                      {$t("common.item")}:
                      <span class="tabular-nums text-text-primary"
                        >{item.ownedPartTypes ?? 0}/{item.totalPartTypes ?? 0}</span
                      >
                    </span>
                  {/if}
                  {#if showsRank(item)}
                    <span class="tabular-nums text-text-secondary">{item.rank}/{item.maxRank}</span>
                  {/if}
                  <span
                    class="inline-flex items-center gap-1 tabular-nums {item.displayPlatinum == null
                      ? 'text-text-muted'
                      : 'text-accent-bright'}"
                  >
                    {numberLabel(item.displayPlatinum, $locale)} P
                  </span>
                  {#if showDucats}
                    <span
                      class="inline-flex items-center gap-1 tabular-nums {item.ducats == null
                        ? 'text-text-muted'
                        : 'text-accent'}"
                    >
                      {numberLabel(item.ducats, $locale)} D
                    </span>
                  {/if}
                  <span class="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      class="detail-close"
                      onclick={(event) => {
                        event.stopPropagation();
                        onExpand(item);
                      }}
                    >
                      {$t("common.details")}
                    </button>
                    <WikiButton wikiUrl={item.wikiaUrl} fallbackName={item.name} />
                    {#if item.marketSlug}
                      <button
                        type="button"
                        class="detail-close"
                        onclick={(event) => {
                          event.stopPropagation();
                          void openQuickSell(item);
                        }}
                      >
                        {$t("inventory.quickSell")}
                      </button>
                    {/if}
                  </span>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if totalCount != null && items.length < totalCount}
      {#key items.length}
        <div class="h-px" use:observeMore aria-hidden="true"></div>
      {/key}
    {/if}
  {/if}
</div>

{#if menu}
  <div
    class="fixed z-[60] min-w-[13rem] rounded-lg border border-border bg-surface-tooltip py-1 shadow-[var(--ui-panel-shadow)]"
    style="left: {menu.x}px; top: {menu.y}px"
    role="menu"
    tabindex="-1"
    data-list-context-menu
  >
    <button
      type="button"
      role="menuitem"
      class="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      onclick={() => runMenu((item) => onExpand(item))}
    >
      {$t("common.details")}
    </button>
    <button
      type="button"
      role="menuitem"
      class="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      onclick={() => runMenu((item) => openWiki(item))}
    >
      {$t("common.wiki")}
    </button>
    {#if menu.item.marketSlug}
      <button
        type="button"
        role="menuitem"
        class="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        onclick={() => runMenu((item) => void openQuickSell(item))}
      >
        {$t("inventory.quickSell")}
      </button>
    {/if}
    <button
      type="button"
      role="menuitem"
      class="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      onclick={() => runMenu((item) => void copyName(item))}
    >
      {$t("inventory.copyName")}
    </button>
  </div>
{/if}

<style>
  .inventory-list th {
    position: sticky;
    top: var(--inventory-sticky-height, 0px);
    z-index: 1;
  }
</style>
