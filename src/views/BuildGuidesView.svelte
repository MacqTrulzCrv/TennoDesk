<script lang="ts">
  import { locale, tr, type MessageKey } from "../lib/i18n.js";
  import { openQuickBuyByName } from "../lib/inventory/quickSell.js";
  import { itemDb, parsedItems } from "../stores/data.js";
  import { currentView } from "../stores/app.js";
  import { pinnedBuilds, togglePinnedBuild } from "../stores/pinnedBuilds.js";
  import { wikiSearchRequest, buildGuideRequest } from "../stores/modals.js";
  import { dropRarityColour } from "../lib/dropDisplay.js";
  import { POLARITY_ICON_URLS } from "../lib/assetUrls.js";
  import ItemImage from "../components/ItemImage.svelte";
  import {
    BUILD_GUIDES,
    BUILD_MOD_META,
    BUILD_NOTES_EN,
    type BuildFocus,
    type BuildGuideItem,
    type BuildItemType,
    type BuildRole,
  } from "../data/buildGuides.js";
  import type { ItemDbEntry, ParsedItem } from "../types/inventory.js";

  const TYPES: readonly BuildItemType[] = ["warframe", "primary", "secondary", "melee"];
  const ROLES: readonly BuildRole[] = ["dps", "support", "tank", "farm", "utility"];

  /** The landing tab: a meta showcase of every covered item, grouped by type. */
  type BuildTab = "overview" | BuildItemType;
  const TABS: readonly BuildTab[] = ["overview", ...TYPES];

  // The dictionary rejects duplicate values, so most of these tags borrow the
  // key that already owns the word rather than adding a builds-local twin.
  const TYPE_LABEL_KEYS: Record<BuildItemType, MessageKey> = {
    warframe: "profile.warframe",
    primary: "common.primary",
    secondary: "builds.type.secondary",
    melee: "rivens.type.melee",
  };
  const ROLE_LABEL_KEYS: Record<BuildRole, MessageKey> = {
    dps: "builds.role.dps",
    support: "builds.role.support",
    tank: "builds.role.tank",
    farm: "builds.role.farm",
    utility: "builds.role.utility",
  };
  const FOCUS_LABEL_KEYS: Record<BuildFocus, MessageKey> = {
    general: "settings.tabGeneral",
    steelpath: "common.steelPath",
  };

  let selectedTab: BuildTab = "overview";
  let query = "";
  let selectedRole: BuildRole | null = null;
  let selectedName = "";

  function toggleRole(role: BuildRole): void {
    selectedRole = selectedRole === role ? null : role;
  }

  // Filters reset so the showcased item can never land behind its own filter.
  function openItem(type: BuildItemType, name: string): void {
    query = "";
    selectedRole = null;
    selectedName = name;
    selectedTab = type;
  }

  function itemRoles(entry: BuildGuideItem): BuildRole[] {
    const seen: BuildRole[] = [];
    for (const build of entry.builds) {
      for (const role of build.roles) if (!seen.includes(role)) seen.push(role);
    }
    return seen;
  }

  // An item stays visible while any of its builds passes both filters; a query
  // hit on the item name keeps every remaining build of that item.
  $: needle = query.trim().toLowerCase();
  $: visibleItems = BUILD_GUIDES.items
    .filter((entry) => entry.type === selectedTab)
    .map(
      (entry): BuildGuideItem => ({
        ...entry,
        builds: entry.builds.filter(
          (build) =>
            (!selectedRole || build.roles.includes(selectedRole)) &&
            (!needle ||
              entry.item.toLowerCase().includes(needle) ||
              build.name.toLowerCase().includes(needle)),
        ),
      }),
    )
    .filter((entry) => entry.builds.length > 0);

  $: if (selectedTab !== "overview" && !visibleItems.some((entry) => entry.item === selectedName)) {
    selectedName = visibleItems[0]?.item ?? "";
  }
  $: currentItem = visibleItems.find((entry) => entry.item === selectedName) ?? null;

  // The reward overlay (and anything else) can hand off an item to open here.
  $: if ($buildGuideRequest) {
    const requested = $buildGuideRequest;
    buildGuideRequest.set(null);
    const match = BUILD_GUIDES.items.find((entry) => entry.item === requested);
    // openItem's assignments must land outside this reactive flush; called from
    // within it (e.g. on mount with a pending request) they do not propagate to
    // the derived visibleItems/currentItem, leaving the view on an empty tab.
    // A microtask runs it like a click handler would, so the view updates.
    if (match) {
      const target = match;
      queueMicrotask(() => openItem(target.type, target.item));
    }
  }

  // Guide art resolves per category, so a frame never borrows the image of a
  // same-named gem or decoration; newer items can appear under the singular
  // category spelling, hence both forms.
  const TYPE_DB_CATEGORIES: Record<BuildItemType, readonly string[]> = {
    warframe: ["Warframes", "Warframe"],
    primary: ["Primary"],
    secondary: ["Secondary"],
    melee: ["Melee"],
  };

  /** English name -> db category -> imageUrl. */
  function buildArtIndex(db: Record<string, ItemDbEntry>): Map<string, Map<string, string>> {
    // Rebuilt whole and reassigned, so the map itself never needs to publish.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const index = new Map<string, Map<string, string>>();
    for (const entry of Object.values(db)) {
      if (!entry.name || !entry.imageUrl) continue;
      let byCategory = index.get(entry.name);
      if (!byCategory) {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        byCategory = new Map<string, string>();
        index.set(entry.name, byCategory);
      }
      const category = entry.category ?? "";
      if (!byCategory.has(category)) byCategory.set(category, entry.imageUrl);
    }
    return index;
  }

  $: artIndex = buildArtIndex($itemDb);

  function categoryArt(
    name: string,
    type: BuildItemType,
    index: Map<string, Map<string, string>>,
  ): string | null {
    const byCategory = index.get(name);
    if (!byCategory) return null;
    for (const category of TYPE_DB_CATEGORIES[type]) {
      const hit = byCategory.get(category);
      if (hit) return hit;
    }
    return null;
  }

  /** Prime art falls back to the base frame, so a missing render still shows
      the right family instead of the placeholder. */
  function artFor(
    name: string,
    type: BuildItemType,
    index: Map<string, Map<string, string>>,
  ): { src: string | null; fallback: string | null } {
    const exact = categoryArt(name, type, index);
    const base =
      type === "warframe" && name.endsWith(" Prime")
        ? categoryArt(name.slice(0, -" Prime".length), type, index)
        : null;
    const byCategory = index.get(name);
    const any = exact ?? base ?? (byCategory ? [...byCategory.values()][0] : null);
    return { src: any, fallback: base && base !== any ? base : null };
  }

  /** English mod/arcane name -> owned copies, summed over ranks. */
  function buildOwnedIndex(items: ParsedItem[]): Map<string, number> {
    // Rebuilt whole and reassigned, so the map itself never needs to publish.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const index = new Map<string, number>();
    for (const item of items) {
      if (item.category !== "mods" && item.category !== "arcanes") continue;
      // Mastered-but-sold rows must not count as owned copies.
      if (item.currentlyOwned === false) continue;
      const copies = item.combinedAmount ?? item.amount ?? 1;
      index.set(item.name, (index.get(item.name) ?? 0) + copies);
    }
    return index;
  }

  $: ownedIndex = buildOwnedIndex($parsedItems);
  // Without an inventory there is nothing to compare against, so no markers.
  $: hasInventory = $parsedItems.length > 0;

  function isOwned(name: string, index: Map<string, number>): boolean {
    return (index.get(name) ?? 0) > 0;
  }

  function ownedModCount(mods: string[], index: Map<string, number>): number {
    return mods.filter((mod) => isOwned(mod, index)).length;
  }

  function openDrops(name: string): void {
    wikiSearchRequest.set({ query: name, mode: "item" });
    currentView.set("wiki");
  }

  function polarityIcon(polarity: string | null): string | null {
    if (!polarity) return null;
    return (POLARITY_ICON_URLS as Record<string, string>)[polarity] ?? null;
  }

  function modBorder(name: string): string {
    const meta = BUILD_MOD_META[name];
    return meta ? dropRarityColour(meta.rarity) : "var(--border)";
  }

  /** Negative drain means added capacity, rendered with a plus sign. */
  function drainLabel(drain: number | null): string {
    if (drain == null) return "";
    return drain < 0 ? `+${-drain}` : `${drain}`;
  }

  /** Link text for a source; the hostname reads better than a full URL. */
  function sourceHost(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function openSource(url: string): void {
    window.api?.openExternal?.(url);
  }
</script>

<section class="view active">
  <div class="mx-auto flex w-full max-w-[1200px] flex-col gap-4 py-4">
    <header class="view-header mb-0">
      <div class="flex flex-col gap-1">
        <h2>{$tr("nav.builds")}</h2>
        <p class="m-0 text-sm text-text-secondary">{$tr("builds.description")}</p>
        <p class="m-0 text-xs text-text-muted">
          {$tr("builds.updated", { date: BUILD_GUIDES.updatedAt })}
        </p>
      </div>
    </header>

    <div class="flex shrink-0 self-start overflow-hidden rounded-lg border border-border">
      {#each TABS as tab, i (tab)}
        <button
          type="button"
          data-builds-type={tab}
          class="px-3 py-2 text-sm font-display {i > 0
            ? 'border-l border-border'
            : ''} {selectedTab === tab
            ? 'bg-accent-glow text-accent'
            : 'bg-bg-soft text-text-secondary hover:text-text-primary'}"
          on:click={() => (selectedTab = tab)}
          >{$tr(tab === "overview" ? "builds.overview" : TYPE_LABEL_KEYS[tab])}</button
        >
      {/each}
    </div>

    {#if selectedTab === "overview"}
      <div class="flex flex-col gap-5" data-builds-overview>
        {#each TYPES as type (type)}
          <section class="flex flex-col gap-2">
            <h3 class="m-0 font-display text-sm uppercase tracking-[0.05em] text-text-muted">
              {$tr(TYPE_LABEL_KEYS[type])}
            </h3>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {#each BUILD_GUIDES.items.filter((entry) => entry.type === type) as entry (entry.item)}
                {@const art = artFor(entry.item, type, artIndex)}
                <button
                  type="button"
                  data-builds-featured={entry.item}
                  class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border bg-bg-soft p-3 text-center hover:border-accent/50 hover:bg-bg-hover"
                  on:click={() => openItem(type, entry.item)}
                >
                  <span class="flex h-16 w-16 items-center justify-center">
                    <ItemImage
                      src={art.src}
                      fallbackSrc={art.fallback}
                      alt=""
                      cls="max-h-full max-w-full"
                    />
                  </span>
                  <span class="font-display text-sm text-text-primary">{entry.item}</span>
                  <span class="flex flex-wrap justify-center gap-1">
                    {#each itemRoles(entry) as role (entry.item + role)}
                      <span
                        class="rounded border border-border px-1 py-px font-display text-[0.6rem] uppercase tracking-[0.05em] text-text-muted"
                        >{$tr(ROLE_LABEL_KEYS[role])}</span
                      >
                    {/each}
                  </span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {:else}
      <div class="grid items-start gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
        <aside class="flex flex-col gap-3">
          <input
            type="search"
            class="w-full rounded-lg border border-border bg-bg-soft px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
            placeholder={$tr("common.searchPlaceholder")}
            bind:value={query}
            autocomplete="off"
            spellcheck="false"
            data-search-focus
          />
          <div class="flex flex-wrap gap-1.5" data-builds-role-list>
            {#each ROLES as role (role)}
              <button
                type="button"
                data-builds-role={role}
                class="rounded-lg border px-2 py-1 font-display text-[0.65rem] uppercase tracking-[0.05em] {selectedRole ===
                role
                  ? 'border-accent/50 bg-accent-glow text-accent'
                  : 'border-border bg-bg-soft text-text-muted hover:text-text-primary'}"
                on:click={() => toggleRole(role)}>{$tr(ROLE_LABEL_KEYS[role])}</button
              >
            {/each}
          </div>
          {#if visibleItems.length === 0}
            <div
              class="rounded-lg border border-dashed border-border bg-bg-soft px-3 py-4 text-center text-sm text-text-secondary"
            >
              {$tr("builds.noMatches")}
            </div>
          {:else}
            <div class="flex flex-col gap-1" data-builds-item-list>
              {#each visibleItems as entry (entry.item)}
                {@const art = artFor(entry.item, entry.type, artIndex)}
                <button
                  type="button"
                  data-builds-item={entry.item}
                  class="flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left {selectedName ===
                  entry.item
                    ? 'border-accent/50 bg-accent-glow text-accent'
                    : 'border-border bg-bg-soft text-text-secondary hover:text-text-primary'}"
                  on:click={() => (selectedName = entry.item)}
                >
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center">
                    <ItemImage
                      src={art.src}
                      fallbackSrc={art.fallback}
                      alt=""
                      cls="max-h-full max-w-full"
                    />
                  </span>
                  <span class="min-w-0 flex-1 truncate font-display text-sm">{entry.item}</span>
                  <span class="shrink-0 text-[0.65rem] text-text-muted">{entry.builds.length}</span>
                </button>
              {/each}
            </div>
          {/if}
        </aside>

        {#if currentItem}
          {@const headerArt = artFor(currentItem.item, currentItem.type, artIndex)}
          <div class="flex min-w-0 flex-col gap-4">
            <div class="flex items-center gap-3">
              <span class="flex h-14 w-14 shrink-0 items-center justify-center">
                <ItemImage
                  src={headerArt.src}
                  fallbackSrc={headerArt.fallback}
                  alt=""
                  cls="max-h-full max-w-full"
                />
              </span>
              <div class="flex flex-col">
                <h3 class="m-0 font-display text-lg font-semibold text-text-primary">
                  {currentItem.item}
                </h3>
                <span class="text-xs uppercase tracking-[0.05em] text-text-muted"
                  >{$tr(TYPE_LABEL_KEYS[currentItem.type])}</span
                >
              </div>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              {#each currentItem.builds as build (build.id)}
                <article
                  class="flex flex-col gap-3 rounded-lg border border-border bg-bg-soft p-4"
                  data-builds-card={build.id}
                >
                  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <button
                      type="button"
                      class="shrink-0 cursor-pointer self-center border-0 bg-transparent p-0 text-base leading-none {$pinnedBuilds.includes(
                        build.id,
                      )
                        ? 'text-accent'
                        : 'text-text-muted hover:text-accent'}"
                      data-builds-pin={build.id}
                      aria-pressed={$pinnedBuilds.includes(build.id)}
                      title={$tr($pinnedBuilds.includes(build.id) ? "builds.unpin" : "builds.pin")}
                      on:click={() => togglePinnedBuild(build.id)}
                      >{$pinnedBuilds.includes(build.id) ? "★" : "☆"}</button
                    >
                    <h4 class="m-0 font-display text-base font-semibold text-text-primary">
                      {build.name}
                    </h4>
                    <span
                      class="inline-block rounded border px-1.5 py-px font-display text-[0.65rem] font-bold uppercase tracking-[0.05em] {build.focus ===
                      'steelpath'
                        ? 'border-accent/50 bg-accent-glow text-accent'
                        : 'border-border text-text-muted'}"
                      >{$tr(FOCUS_LABEL_KEYS[build.focus])}</span
                    >
                    {#each build.roles as role (build.id + role)}
                      <span
                        class="inline-block rounded border border-border px-1.5 py-px font-display text-[0.65rem] font-bold uppercase tracking-[0.05em] text-text-muted"
                        >{$tr(ROLE_LABEL_KEYS[role])}</span
                      >
                    {/each}
                    {#if hasInventory}
                      {@const ownedCount = ownedModCount(build.mods, ownedIndex)}
                      <span
                        class="ml-auto whitespace-nowrap text-xs {ownedCount === build.mods.length
                          ? 'text-success'
                          : 'text-text-muted'}"
                        title={$tr("common.owned")}>&#10003; {ownedCount}/{build.mods.length}</span
                      >
                    {/if}
                    <span
                      class="{hasInventory
                        ? ''
                        : 'ml-auto '}whitespace-nowrap text-xs text-text-muted"
                      >{$tr("stats.resource.forma")}:
                      <span class="text-text-secondary">{build.forma}</span></span
                    >
                  </div>

                  {#if build.aura || build.exilus || build.stance || build.helminth}
                    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      {#if build.aura}
                        {@const auraMeta = BUILD_MOD_META[build.aura]}
                        {@const auraOwned = hasInventory ? isOwned(build.aura, ownedIndex) : null}
                        <dt class="text-text-muted">{$tr("builds.aura")}</dt>
                        <dd class="m-0 flex items-center gap-1.5 text-text-primary">
                          {#if auraOwned !== null}
                            <span
                              class="text-xs {auraOwned ? 'text-success' : 'text-danger'}"
                              title={$tr(auraOwned ? "common.owned" : "common.missing")}
                              >{auraOwned ? "✓" : "✗"}</span
                            >
                          {/if}
                          {build.aura}
                          {#if auraMeta && polarityIcon(auraMeta.polarity)}
                            <img
                              src={polarityIcon(auraMeta.polarity)}
                              alt={auraMeta.polarity}
                              class="h-3.5 w-3.5 opacity-80"
                            />
                          {/if}
                        </dd>
                      {/if}
                      {#if build.exilus}
                        {@const exilusOwned = hasInventory
                          ? isOwned(build.exilus, ownedIndex)
                          : null}
                        <dt class="text-text-muted">{$tr("builds.exilus")}</dt>
                        <dd class="m-0 flex items-center gap-1.5 text-text-primary">
                          {#if exilusOwned !== null}
                            <span
                              class="text-xs {exilusOwned ? 'text-success' : 'text-danger'}"
                              title={$tr(exilusOwned ? "common.owned" : "common.missing")}
                              >{exilusOwned ? "✓" : "✗"}</span
                            >
                          {/if}
                          {build.exilus}
                        </dd>
                      {/if}
                      {#if build.stance}
                        {@const stanceMeta = BUILD_MOD_META[build.stance]}
                        {@const stanceOwned = hasInventory
                          ? isOwned(build.stance, ownedIndex)
                          : null}
                        <dt class="text-text-muted">{$tr("builds.stance")}</dt>
                        <dd class="m-0 flex items-center gap-1.5 text-text-primary">
                          {#if stanceOwned !== null}
                            <span
                              class="text-xs {stanceOwned ? 'text-success' : 'text-danger'}"
                              title={$tr(stanceOwned ? "common.owned" : "common.missing")}
                              >{stanceOwned ? "✓" : "✗"}</span
                            >
                          {/if}
                          {build.stance}
                          {#if stanceMeta && polarityIcon(stanceMeta.polarity)}
                            <img
                              src={polarityIcon(stanceMeta.polarity)}
                              alt={stanceMeta.polarity}
                              class="h-3.5 w-3.5 opacity-80"
                            />
                          {/if}
                        </dd>
                      {/if}
                      {#if build.helminth}
                        <dt class="text-text-muted">{$tr("builds.helminth")}</dt>
                        <dd class="m-0 text-text-primary">
                          {build.helminth.ability}
                          <span class="text-xs text-text-muted"
                            >({$tr("builds.replaces", { ability: build.helminth.replaces })})</span
                          >
                        </dd>
                      {/if}
                    </dl>
                  {/if}

                  <div class="flex flex-col gap-1.5">
                    <span class="text-xs uppercase tracking-[0.05em] text-text-muted"
                      >{$tr("inventory.tab.mods")}</span
                    >
                    <ol class="m-0 grid list-none grid-cols-1 gap-1.5 p-0 text-sm sm:grid-cols-2">
                      {#each build.mods as mod, i (build.id + mod + i)}
                        {@const meta = BUILD_MOD_META[mod]}
                        {@const owned = hasInventory ? isOwned(mod, ownedIndex) : null}
                        <li
                          class="flex items-center justify-between gap-2 rounded border bg-bg-base px-2 py-1.5"
                          style="border-color: {modBorder(mod)}"
                        >
                          <span class="flex min-w-0 items-center gap-1.5">
                            {#if owned !== null}
                              <span
                                class="shrink-0 text-xs {owned ? 'text-success' : 'text-danger'}"
                                title={$tr(owned ? "common.owned" : "common.missing")}
                                >{owned ? "✓" : "✗"}</span
                              >
                            {/if}
                            {#if owned === false}
                              <button
                                type="button"
                                class="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-text-primary hover:text-accent hover:underline"
                                title={$tr("detail.dropSources")}
                                on:click={() => openDrops(mod)}>{mod}</button
                              >
                            {:else}
                              <span class="min-w-0 truncate text-text-primary">{mod}</span>
                            {/if}
                          </span>
                          <span class="flex shrink-0 items-center gap-1">
                            {#if owned === false}
                              <button
                                type="button"
                                class="rounded border border-border px-1 font-display text-[0.6rem] font-bold text-text-muted hover:border-accent/60 hover:text-accent"
                                data-builds-wtb={mod}
                                title={$tr("common.postWtb")}
                                on:click={() => void openQuickBuyByName(mod)}>WTB</button
                              >
                            {/if}
                            {#if meta?.drain != null}
                              <span class="text-[0.65rem] text-text-muted"
                                >{drainLabel(meta.drain)}</span
                              >
                            {/if}
                            {#if meta && polarityIcon(meta.polarity)}
                              <img
                                src={polarityIcon(meta.polarity)}
                                alt={meta.polarity}
                                class="h-3.5 w-3.5 opacity-80"
                              />
                            {/if}
                          </span>
                        </li>
                      {/each}
                    </ol>
                  </div>

                  <div class="flex flex-wrap items-center gap-1.5 text-sm">
                    <span class="text-xs uppercase tracking-[0.05em] text-text-muted"
                      >{$tr("inventory.tab.arcanes")}</span
                    >
                    {#each build.arcanes as arcane (build.id + arcane)}
                      {@const arcaneOwned = hasInventory ? isOwned(arcane, ownedIndex) : null}
                      {#if arcaneOwned === false}
                        <span
                          class="inline-flex items-center gap-1.5 rounded border border-border/60 bg-bg-base px-2 py-1 text-text-primary"
                        >
                          <button
                            type="button"
                            class="cursor-pointer border-0 bg-transparent p-0 text-left text-inherit hover:text-accent"
                            title={$tr("detail.dropSources")}
                            on:click={() => openDrops(arcane)}
                            ><span class="mr-1 text-xs text-danger">✗</span>{arcane}</button
                          >
                          <button
                            type="button"
                            class="rounded border border-border px-1 font-display text-[0.6rem] font-bold text-text-muted hover:border-accent/60 hover:text-accent"
                            data-builds-wtb={arcane}
                            title={$tr("common.postWtb")}
                            on:click={() => void openQuickBuyByName(arcane)}>WTB</button
                          >
                        </span>
                      {:else}
                        <span
                          class="rounded border border-border/60 bg-bg-base px-2 py-1 text-text-primary"
                          >{#if arcaneOwned}<span
                              class="mr-1 text-xs text-success"
                              title={$tr("common.owned")}>✓</span
                            >{/if}{arcane}</span
                        >
                      {/if}
                    {/each}
                  </div>

                  {#if build.archonShards}
                    <p class="m-0 text-sm">
                      <span class="text-xs uppercase tracking-[0.05em] text-text-muted"
                        >{$tr("archon.title")}</span
                      >
                      <span class="ml-1.5 text-text-secondary">{build.archonShards}</span>
                    </p>
                  {/if}

                  <p class="m-0 border-t border-border/60 pt-2 text-sm text-text-secondary">
                    {$locale === "tr" ? build.notesTr : (BUILD_NOTES_EN[build.id] ?? build.notesTr)}
                  </p>

                  <div class="mt-auto flex flex-wrap items-center gap-2">
                    <span class="text-xs uppercase tracking-[0.05em] text-text-muted"
                      >{$tr("common.source")}</span
                    >
                    {#each build.sources as url (url)}
                      <button
                        type="button"
                        data-builds-source={url}
                        class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                        on:click={() => openSource(url)}>{sourceHost(url)}</button
                      >
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>
