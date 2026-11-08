<script lang="ts">
  import { tr, type MessageKey } from "../../lib/i18n.js";
  import InventoryGrid from "../inventory/InventoryGrid.svelte";
  import InventoryOrderBookPanel from "../inventory/InventoryOrderBookPanel.svelte";
  import { activeItem, activeRelic } from "../../stores/modals.js";
  import { parsedItems, wfmItems } from "../../stores/data.js";
  import { relicDb } from "../../stores/relics.js";
  import { relicGroupForUniqueName } from "../../lib/relic.js";
  import { marketOrders } from "../../stores/market.js";
  import { getInventoryHydrationController } from "../../stores/inventoryHydration.js";
  import {
    bulkSellOpen,
    clearSelection,
    inventorySelection,
    toggleSelected,
  } from "../../stores/inventorySelection.js";
  import {
    buildBaseInventoryItems,
    buildInventoryViewItems,
    buildOrderLookups,
    shouldHydrateMetrics,
    type InventoryBaseItem,
    type InventoryViewItem,
  } from "../../lib/inventoryMarket.js";
  import { isPrimeRow } from "../../lib/inventory/valueTotals.js";
  import { itemLabel } from "../../lib/itemLabel.js";
  import { isRankedGroup } from "../../../config/shared/numeric.js";
  import { isWfmExcludedSlug } from "../../../config/shared/wfmExclusions.js";

  // Shared with the Inventory tab, so prices hydrated there show here at once.
  const hydration = getInventoryHydrationController();
  const hydrationMetrics = hydration.metricsByKey;

  type SellCategory = "all" | "prime" | "mods" | "arcanes" | "full_sets";
  const CATEGORIES: readonly SellCategory[] = ["all", "prime", "mods", "arcanes", "full_sets"];
  const CATEGORY_LABEL_KEYS: Record<SellCategory, MessageKey> = {
    all: "common.all",
    prime: "market.sellables.prime",
    mods: "inventory.tab.mods",
    arcanes: "inventory.tab.arcanes",
    full_sets: "inventory.tab.fullSets",
  };

  type SellSortKey = "platinum" | "ducats" | "ducatonator" | "amount" | "name";
  const SORT_OPTIONS: ReadonlyArray<{ key: SellSortKey; labelKey: MessageKey }> = [
    { key: "platinum", labelKey: "common.platinum" },
    { key: "ducats", labelKey: "common.ducats" },
    { key: "ducatonator", labelKey: "market.ducatsPerPlatinum" },
    { key: "amount", labelKey: "common.quantity" },
    { key: "name", labelKey: "common.name" },
  ];

  const PAGE_SIZE = 120;
  let category: SellCategory = "all";
  let query = "";
  let unlistedOnly = false;
  let sortBy: SellSortKey = "platinum";
  let sortDescending = true;
  let limit = PAGE_SIZE;

  function selectSort(next: SellSortKey): void {
    sortBy = next;
    // Names read ascending, every numeric column reads best-first.
    sortDescending = next !== "name";
    limit = PAGE_SIZE;
  }

  function flipSortDirection(): void {
    sortDescending = !sortDescending;
    limit = PAGE_SIZE;
  }

  function selectCategory(next: SellCategory): void {
    category = next;
    limit = PAGE_SIZE;
  }

  function onQueryInput(): void {
    limit = PAGE_SIZE;
  }

  function toggleUnlistedOnly(): void {
    unlistedOnly = !unlistedOnly;
    limit = PAGE_SIZE;
  }

  // Local to this tab so flipping it never drags the Inventory view into
  // selection mode too; the picked keys themselves are the shared store the
  // bulk sell workbench reads.
  let selecting = false;

  function toggleSelecting(): void {
    selecting = !selecting;
  }

  function sellable(item: InventoryBaseItem): boolean {
    if (item.tradable === false) return false;
    const slug = item.marketSlug;
    if (!slug) return false;
    return !isWfmExcludedSlug(slug);
  }

  $: lookups = buildOrderLookups($marketOrders);

  // Sets live in their own tab source, everything covers the loose stock; the
  // chips only pick between the two prebuilt bases.
  $: everythingBase = buildBaseInventoryItems(
    $parsedItems,
    "everything",
    $wfmItems,
    lookups.orderedNames,
    lookups.orderedSlugs,
    $relicDb,
    lookups.orderedSubtypes,
  ).filter(sellable);
  $: setsBase = buildBaseInventoryItems(
    $parsedItems,
    "full_sets",
    $wfmItems,
    lookups.orderedNames,
    lookups.orderedSlugs,
    $relicDb,
    lookups.orderedSubtypes,
  ).filter(sellable);

  $: categoryBase =
    category === "full_sets"
      ? setsBase
      : category === "all"
        ? everythingBase
        : category === "prime"
          ? everythingBase.filter((item) => isPrimeRow(item))
          : everythingBase.filter((item) => item.inventoryGroup === category);

  $: needle = query.trim().toLowerCase();
  $: filteredBase = categoryBase.filter((item) => {
    if (unlistedOnly && item.orderPlaced) return false;
    if (!needle) return true;
    return (
      itemLabel(item).toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)
    );
  });

  $: viewItems = buildInventoryViewItems(filteredBase, $hydrationMetrics);

  // Rows without the chosen figure always sink to the bottom, whatever the
  // direction, so flipping never floods the top with unpriced stock.
  function numericValue(item: InventoryViewItem, key: SellSortKey): number | null {
    if (key === "platinum") return item.platinum;
    if (key === "ducats") return item.ducats;
    if (key === "ducatonator") return item.ducatonator;
    if (key === "amount") return item.amount;
    return null;
  }

  $: sorted = [...viewItems].sort((a, b) => {
    if (sortBy !== "name") {
      const left = numericValue(a, sortBy);
      const right = numericValue(b, sortBy);
      if (left == null && right != null) return 1;
      if (left != null && right == null) return -1;
      if (left != null && right != null && left !== right) {
        return sortDescending ? right - left : left - right;
      }
    }
    const byName = itemLabel(a).localeCompare(itemLabel(b));
    return sortBy === "name" && sortDescending ? -byName : byName;
  });
  $: pageItems = sorted.slice(0, limit);

  // Rebuilt whole and reassigned, so the set itself never needs to publish.
  function eligibleKeysOf(items: readonly InventoryViewItem[]): ReadonlySet<string> {
    return new Set(items.map((item) => item.internalName));
  }

  $: eligibleKeys = eligibleKeysOf(sorted);

  // Card click opens the warframe.market order book / sell panel on the right,
  // exactly like the Inventory tab - this is a selling screen, so the primary
  // click lands on the live buy/sell board, not the read-only detail modal.
  let selectedInternalName: string | null = null;
  let orderBookPanelOpen = false;
  $: selectedItem = selectedInternalName
    ? sorted.find((entry) => entry.internalName === selectedInternalName) || null
    : null;

  function handleSelect(item: InventoryViewItem): void {
    selectedInternalName = item.internalName;
    orderBookPanelOpen = true;
    const base = filteredBase.find((entry) => entry.internalName === item.internalName);
    if (base && shouldHydrateMetrics(base)) {
      hydration.enqueue([base], $wfmItems, {
        price: true,
        ducats: false,
        orders: true,
        network: true,
      });
    }
  }

  function closeOrderBookPanel(): void {
    selectedInternalName = null;
    orderBookPanelOpen = false;
  }

  function handleVisible(item: InventoryViewItem): void {
    if (!shouldHydrateMetrics(item)) return;
    hydration.enqueue([item], $wfmItems, {
      price: true,
      ducats: false,
      orders: isRankedGroup(item.inventoryGroup),
      network: true,
    });
  }

  function handleExpand(item: InventoryViewItem): void {
    // Mirror the Inventory tab exactly: relics open the reward breakdown, and
    // every other row resolves straight back to its parsed inventory entry
    // instead of the fragile itemDb lookup that silently no-ops on a miss.
    const relicGroup = relicGroupForUniqueName($relicDb, item.internalName);
    if (relicGroup) {
      activeRelic.set(relicGroup);
      return;
    }
    const cardKey = item.internalName;
    const parsed =
      $parsedItems.find((entry) => entry.inventoryKey === cardKey) ??
      $parsedItems.find((entry) => entry.internalName === cardKey);
    // Base items predate hydration - carry the slug so the modal prices by it.
    if (parsed) activeItem.set({ ...parsed, marketSlug: item.marketSlug });
  }
</script>

<div class="flex flex-col gap-3" data-market-sellables>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex shrink-0 overflow-hidden rounded-lg border border-border">
      {#each CATEGORIES as entry, i (entry)}
        <button
          type="button"
          data-sellables-category={entry}
          class="px-3 py-2 text-sm font-display {i > 0
            ? 'border-l border-border'
            : ''} {category === entry
            ? 'bg-accent-glow text-accent'
            : 'bg-bg-soft text-text-secondary hover:text-text-primary'}"
          on:click={() => selectCategory(entry)}>{$tr(CATEGORY_LABEL_KEYS[entry])}</button
        >
      {/each}
    </div>
    <input
      type="search"
      class="min-w-[200px] flex-1 rounded-lg border border-border bg-bg-soft px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
      placeholder={$tr("common.searchPlaceholder")}
      bind:value={query}
      on:input={onQueryInput}
      autocomplete="off"
      spellcheck="false"
      data-search-focus
    />
    <label
      class="flex w-fit shrink-0 cursor-pointer items-center gap-2 text-xs text-text-secondary"
    >
      <input
        type="checkbox"
        checked={unlistedOnly}
        data-sellables-unlisted
        on:change={toggleUnlistedOnly}
      />
      {$tr("workbench.filter.listedUnlisted")}
    </label>
    <div class="flex shrink-0 items-center gap-1">
      <span class="text-xs uppercase tracking-[0.05em] text-text-muted">{$tr("common.sort")}</span>
      <select
        class="shared-filter-select"
        data-sellables-sort
        value={sortBy}
        on:change={(event) => selectSort(event.currentTarget.value as SellSortKey)}
      >
        {#each SORT_OPTIONS as option (option.key)}
          <option value={option.key}>{$tr(option.labelKey)}</option>
        {/each}
      </select>
      <button
        type="button"
        class="rounded-lg border border-border bg-bg-soft px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        data-sellables-sort-direction
        title={$tr(sortDescending ? "common.sortHighToLow" : "common.sortLowToHigh")}
        aria-label={$tr(
          sortDescending ? "common.sortDirectionDescending" : "common.sortDirectionAscending",
        )}
        on:click={flipSortDirection}
      >
        {sortDescending ? "↓" : "↑"}
      </button>
    </div>
    <span class="shrink-0 text-xs text-text-muted" data-sellables-count>
      {$tr("market.sellables.count", { count: sorted.length })}
    </span>
    <div class="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 font-display text-xs {selecting
          ? 'border-accent/50 bg-accent-glow text-accent'
          : 'border-border bg-bg-soft text-text-secondary hover:text-text-primary'}"
        data-sellables-select-mode
        title={$tr("inventory.selectModeHint")}
        on:click={toggleSelecting}
      >
        {$tr("inventory.selectMode")}
      </button>
      {#if selecting}
        <span class="text-xs text-text-muted"
          >{$tr("common.selected", { count: $inventorySelection.size })}</span
        >
        <button
          type="button"
          class="rounded-lg border border-border bg-bg-soft px-2.5 py-1.5 font-display text-xs text-text-secondary hover:text-text-primary"
          on:click={clearSelection}
        >
          {$tr("inventory.clearSelection")}
        </button>
        <button
          type="button"
          class="btn-success btn-sm"
          data-sellables-bulk-sell
          disabled={$inventorySelection.size === 0}
          on:click={() => bulkSellOpen.set(true)}
        >
          {$tr("inventory.openBulkSell")}
        </button>
      {/if}
    </div>
  </div>

  <!-- Card click opens the order book / sell panel on the right like the
       Inventory tab; "Details" still opens the read-only modal, and the hover
       quick-sell button stays the one-click listing path. -->
  <div
    class="grid grid-cols-1 items-start gap-3 {orderBookPanelOpen
      ? 'min-[1101px]:grid-cols-[minmax(0,1fr)_360px]'
      : ''}"
  >
    <div class="min-w-0">
      <InventoryGrid
        items={pageItems}
        totalCount={sorted.length}
        detailKeys={null}
        selectionMode={selecting}
        selectedKeys={$inventorySelection}
        {eligibleKeys}
        on:select={(event) => handleSelect(event.detail)}
        on:visible={(event) => handleVisible(event.detail)}
        on:expand={(event) => handleExpand(event.detail)}
        on:toggle={(event) => toggleSelected(event.detail.item.internalName)}
        on:more={() => (limit += PAGE_SIZE)}
      />
    </div>

    {#if orderBookPanelOpen}
      <InventoryOrderBookPanel item={selectedItem} onClose={closeOrderBookPanel} />
    {/if}
  </div>
</div>
