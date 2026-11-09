<script lang="ts">
  import { onDestroy, untrack } from "svelte";

  import { tr, type MessageKey } from "../lib/i18n.js";
  import { parsedItems, wfmItems } from "../stores/data.js";
  import { currentView } from "../stores/app.js";
  import { wikiSearchRequest } from "../stores/modals.js";
  import { pinnedBuilds } from "../stores/pinnedBuilds.js";
  import { openQuickBuyByName } from "../lib/inventory/quickSell.js";
  import { dropRarityColour } from "../lib/dropDisplay.js";
  import { fetchPriceByName } from "../lib/wfm/wfmPrice.js";
  import {
    aggregateMissing,
    buildOwnedModIndex,
    itemsInScope,
    ownedEquipmentNames,
    type ShoppingScope,
  } from "../lib/builds/shoppingList.js";

  // How many prices to pull per scope view; the WFM queue is throttled, so this
  // bounds a long background fill rather than flooding it.
  const PRICE_FETCH_CAP = 80;

  const SCOPES: { key: ShoppingScope; labelKey: MessageKey }[] = [
    { key: "mine", labelKey: "shopping.scope.mine" },
    { key: "pinned", labelKey: "shopping.scope.pinned" },
    { key: "all", labelKey: "shopping.scope.all" },
  ];

  let scope = $state<ShoppingScope>("mine");
  // name -> median platinum; null once fetched with no listing.
  let prices = $state<Record<string, number | null>>({});
  let pending = $state<Record<string, true>>({});

  const ownedEquip = $derived(ownedEquipmentNames($parsedItems));
  const ownedMods = $derived(buildOwnedModIndex($parsedItems));
  const pinnedSet = $derived(new Set($pinnedBuilds));
  const hasInventory = $derived($parsedItems.length > 0);

  const missing = $derived(
    aggregateMissing(itemsInScope(scope, ownedEquip, pinnedSet), ownedMods).sort(
      (a, b) => b.buildCount - a.buildCount || a.name.localeCompare(b.name),
    ),
  );

  const knownTotal = $derived(missing.reduce((sum, row) => sum + (prices[row.name] ?? 0), 0));

  // Background price fill: one request at a time through the throttled queue,
  // cancelled when the scope changes or the view unmounts.
  let fillToken = 0;
  $effect(() => {
    // Depend ONLY on `missing`; the fetch reads/writes prices+pending, so running
    // it untracked stops the effect from re-triggering itself into a freeze loop.
    const names = missing.slice(0, PRICE_FETCH_CAP).map((row) => row.name);
    untrack(() => {
      const token = ++fillToken;
      void fillPrices(names, token);
    });
  });
  onDestroy(() => {
    fillToken++;
  });

  async function fillPrices(names: string[], token: number): Promise<void> {
    const lookup = $wfmItems;
    for (const name of names) {
      if (token !== fillToken) return;
      if (name in prices || pending[name]) continue;
      pending = { ...pending, [name]: true };
      try {
        const result = await fetchPriceByName(name, lookup, { rank: 0, priority: "low" });
        if (token !== fillToken) return;
        prices = { ...prices, [name]: result?.median ?? null };
      } catch {
        if (token !== fillToken) return;
        prices = { ...prices, [name]: null };
      } finally {
        const next = { ...pending };
        delete next[name];
        pending = next;
      }
    }
  }

  function priceLabel(name: string): string {
    const value = prices[name];
    if (value != null) return `${value}p`;
    if (name in prices) return "-";
    return pending[name] ? "..." : "-";
  }

  function rarityColour(rarity: string | null): string {
    return rarity ? dropRarityColour(rarity) : "var(--border)";
  }

  function openDrops(name: string): void {
    wikiSearchRequest.set({ query: name, mode: "item" });
    currentView.set("wiki");
  }
</script>

<section class="view active">
  <div class="mx-auto flex w-full max-w-[1000px] flex-col gap-4 py-4">
    <header class="view-header mb-0">
      <div class="flex flex-col gap-1">
        <h2>{$tr("nav.shopping")}</h2>
        <p class="m-0 text-sm text-text-secondary">{$tr("shopping.description")}</p>
      </div>
    </header>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex overflow-hidden rounded-lg border border-border" role="group">
        {#each SCOPES as option, index (option.key)}
          <button
            type="button"
            data-shopping-scope={option.key}
            class="px-3 py-1.5 font-display text-sm {index > 0
              ? 'border-l border-border'
              : ''} {scope === option.key
              ? 'bg-accent-glow text-accent'
              : 'bg-bg-soft text-text-secondary hover:text-text-primary'}"
            aria-pressed={scope === option.key}
            onclick={() => (scope = option.key)}>{$tr(option.labelKey)}</button
          >
        {/each}
      </div>
      {#if missing.length > 0}
        <span class="font-display text-sm text-text-muted" data-shopping-total>
          {$tr("shopping.summary", { count: missing.length })}
          {#if knownTotal > 0}· ~{knownTotal}p{/if}
        </span>
      {/if}
    </div>

    {#if missing.length === 0}
      <div
        class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-bg-soft px-4 py-10 text-center"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="h-10 w-10 text-accent"
        >
          <path d="M3 3h2l2.4 12.3a1 1 0 0 0 1 .7h9.7a1 1 0 0 0 1-.8L22 7H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
        <p class="m-0 text-sm text-text-secondary">
          {hasInventory ? $tr("shopping.emptyDone") : $tr("shopping.emptyNoInventory")}
        </p>
      </div>
    {:else}
      <ul class="m-0 flex list-none flex-col gap-1.5 p-0" data-shopping-list>
        {#each missing as row (row.name)}
          <li
            class="flex items-center gap-3 rounded-md border bg-bg-soft px-3 py-2"
            style="border-color: {rarityColour(row.rarity)}"
          >
            <button
              type="button"
              class="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
              title={$tr("detail.dropSources")}
              onclick={() => openDrops(row.name)}
            >
              <span class="block truncate font-display text-sm text-text-primary hover:text-accent"
                >{row.name}</span
              >
              <span class="block truncate text-xs text-text-muted">
                {$tr("shopping.neededBy", { count: row.buildCount })} · {row.fromItems.join(", ")}
              </span>
            </button>
            <span
              class="shrink-0 font-display text-sm tabular-nums text-accent-bright"
              data-shopping-price={row.name}>{priceLabel(row.name)}</span
            >
            <button
              type="button"
              class="shrink-0 rounded border border-border px-2 py-1 font-display text-[0.65rem] font-bold text-text-muted hover:border-accent/60 hover:text-accent"
              data-shopping-wtb={row.name}
              title={$tr("common.postWtb")}
              onclick={() => void openQuickBuyByName(row.name)}>WTB</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
