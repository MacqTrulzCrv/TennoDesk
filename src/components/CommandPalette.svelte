<script lang="ts">
  import { tick } from "svelte";

  import { paletteOpen, closePalette } from "../stores/commandPalette.js";
  import { currentView } from "../stores/app.js";
  import { parsedItems } from "../stores/data.js";
  import { activeItem } from "../stores/modals.js";
  import { tr } from "../lib/i18n.js";
  import { itemLabel } from "../lib/itemLabel.js";
  import { NAV_ICON_URLS } from "../lib/assetUrls.js";
  import {
    SIDEBAR_VIEW_ORDER,
    VIEW_LABEL_KEYS,
    type SidebarViewName,
  } from "../lib/viewRegistry.js";
  import { refreshMarketOrders } from "../lib/marketOrdersSync.js";
  import { bulkSellOpen } from "../stores/inventorySelection.js";
  import { recentItems } from "../stores/recentItems.js";
  import { startTour } from "../stores/tour.js";
  import { toggleShortcutSheet } from "../stores/shortcutSheet.js";
  import type { ParsedItem } from "../types/inventory.js";

  type NavCmd = { kind: "nav"; id: string; label: string; view: SidebarViewName; icon: string };
  type ItemCmd = { kind: "item"; id: string; label: string; sub: string; item: ParsedItem };
  type ActionCmd = { kind: "action"; id: string; label: string; icon: string; run: () => void };
  type Cmd = NavCmd | ItemCmd | ActionCmd;

  const ITEM_RESULT_LIMIT = 8;

  let query = "";
  let selected = 0;
  let inputEl: HTMLInputElement | null = null;
  let wasOpen = false;

  const navCmds: NavCmd[] = SIDEBAR_VIEW_ORDER.map((view) => ({
    kind: "nav",
    id: `nav:${view}`,
    label: "",
    view,
    icon: NAV_ICON_URLS[view],
  }));

  // Labels depend on the active locale, so resolve them reactively.
  $: localizedNav = navCmds.map((cmd) => ({ ...cmd, label: $tr(VIEW_LABEL_KEYS[cmd.view]) }));

  // Quick commands that do something rather than navigate; labels are reactive.
  $: actionCmds = [
    {
      kind: "action",
      id: "action:refreshPrices",
      label: $tr("palette.refreshPrices"),
      icon: NAV_ICON_URLS.market,
      run: () => void refreshMarketOrders(),
    },
    {
      kind: "action",
      id: "action:bulkSell",
      label: $tr("palette.bulkSell"),
      icon: NAV_ICON_URLS.market,
      run: () => bulkSellOpen.set(true),
    },
    {
      kind: "action",
      id: "action:shortcuts",
      label: $tr("palette.shortcuts"),
      icon: NAV_ICON_URLS.settings,
      run: () => toggleShortcutSheet(),
    },
    {
      kind: "action",
      id: "action:startTour",
      label: $tr("palette.startTour"),
      icon: NAV_ICON_URLS.settings,
      run: () => startTour(),
    },
  ] as ActionCmd[];

  // Items opened this session, shown only on an empty query as a quick re-open.
  $: recentCmds = (
    !q
      ? $recentItems.map(
          (item): ItemCmd => ({
            kind: "item",
            id: `recent:${item.internalName}`,
            label: itemLabel(item),
            sub: $tr("palette.recent"),
            item,
          }),
        )
      : []
  ) as ItemCmd[];

  $: q = query.trim().toLowerCase();

  $: navMatches = q
    ? localizedNav.filter((cmd) => cmd.label.toLowerCase().includes(q))
    : localizedNav;

  $: actionMatches = q
    ? actionCmds.filter((cmd) => cmd.label.toLowerCase().includes(q))
    : actionCmds;

  // Mods/arcanes are split into one row per rank but share an internalName, so
  // the match list must dedupe on it: a repeated id crashes the keyed {#each}.
  $: itemMatches =
    q.length >= 2
      ? Array.from(
          new Map(
            $parsedItems
              .filter((item) => itemLabel(item).toLowerCase().includes(q))
              .map((item) => [item.internalName, item]),
          ).values(),
        )
          .slice(0, ITEM_RESULT_LIMIT)
          .map(
            (item): ItemCmd => ({
              kind: "item",
              id: `item:${item.internalName}`,
              label: itemLabel(item),
              sub: item.categoryLabel ?? "",
              item,
            }),
          )
      : [];

  $: results = [...recentCmds, ...navMatches, ...actionMatches, ...itemMatches] as Cmd[];
  $: if (selected > results.length - 1) selected = Math.max(0, results.length - 1);

  // Autofocus and reset whenever the palette transitions to open. wasOpen is the
  // transition guard read by the condition above, so its writes are not useless.
  $: if ($paletteOpen && !wasOpen) {
    // eslint-disable-next-line no-useless-assignment
    wasOpen = true;
    query = "";
    selected = 0;
    void focusInput();
  } else if (!$paletteOpen && wasOpen) {
    // eslint-disable-next-line no-useless-assignment
    wasOpen = false;
  }

  async function focusInput(): Promise<void> {
    await tick();
    inputEl?.focus();
  }

  function run(cmd: Cmd | undefined): void {
    if (!cmd) return;
    if (cmd.kind === "nav") {
      currentView.set(cmd.view);
    } else if (cmd.kind === "action") {
      cmd.run();
    } else {
      activeItem.set(cmd.item);
    }
    closePalette();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = results.length ? (selected + 1) % results.length : 0;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = results.length ? (selected - 1 + results.length) % results.length : 0;
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  }
</script>

{#if $paletteOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="cmdk-backdrop" on:click={closePalette}></div>
  <div class="cmdk" role="dialog" aria-modal="true" aria-label={$tr("nav.quickSwitch")}>
    <div class="cmdk-search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" stroke-linecap="round" />
      </svg>
      <input
        bind:this={inputEl}
        bind:value={query}
        on:keydown={onKeydown}
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder={$tr("nav.quickSwitchHint")}
      />
      <kbd>esc</kbd>
    </div>
    <div class="cmdk-list">
      {#if results.length === 0}
        <div class="cmdk-empty">{$tr("common.noResults")}</div>
      {:else}
        {#each results as cmd, i (cmd.id)}
          <button
            type="button"
            class="cmdk-row"
            class:on={i === selected}
            on:mousemove={() => (selected = i)}
            on:click={() => run(cmd)}
          >
            <span class="cmdk-ic">
              {#if cmd.kind === "nav" || cmd.kind === "action"}
                <img src={cmd.icon} alt="" />
              {:else if cmd.item.imageUrl}
                <img src={cmd.item.imageUrl} alt="" />
              {/if}
            </span>
            <span class="cmdk-text">
              <span class="cmdk-label">{cmd.label}</span>
              {#if cmd.kind === "item"}
                <span class="cmdk-sub">{cmd.sub}</span>
              {/if}
            </span>
            <span class="cmdk-tag"
              >{cmd.kind === "nav"
                ? $tr("nav.goTo")
                : cmd.kind === "action"
                  ? $tr("palette.run")
                  : $tr("common.item")}</span
            >
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .cmdk-backdrop {
    position: fixed;
    inset: var(--titlebar-height) 0 0 0;
    z-index: 1200;
    background: color-mix(in oklab, var(--bg-deep) 62%, transparent);
    backdrop-filter: blur(2px);
  }
  .cmdk {
    position: fixed;
    z-index: 1210;
    left: 50%;
    top: calc(var(--titlebar-height) + 9vh);
    transform: translateX(-50%);
    width: min(560px, calc(100vw - 3rem));
    display: flex;
    flex-direction: column;
    max-height: 60vh;
    border: 1px solid color-mix(in oklab, var(--accent) 24%, var(--border-strong));
    border-radius: var(--radius-xl);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--bg-surface) 96%, white 3%),
      var(--bg-base)
    );
    box-shadow:
      0 40px 90px -30px rgb(0 0 0 / 0.75),
      0 0 40px -18px var(--accent-glow);
    overflow: hidden;
  }
  .cmdk-search {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.95rem 1.1rem;
    border-bottom: 1px solid var(--border);
  }
  .cmdk-search svg {
    width: 1.15rem;
    height: 1.15rem;
    color: var(--accent);
    flex: none;
  }
  .cmdk-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 1.05rem;
    outline: none;
  }
  .cmdk-search input::placeholder {
    color: var(--text-muted);
  }
  .cmdk-search kbd {
    flex: none;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--text-muted);
    background: color-mix(in oklab, var(--bg-raised) 90%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.12rem 0.44rem;
  }
  .cmdk-list {
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .cmdk-empty {
    padding: 1.1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .cmdk-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
  }
  .cmdk-row.on {
    background: linear-gradient(
      90deg,
      color-mix(in oklab, var(--accent) 16%, transparent),
      transparent
    );
    color: var(--text-primary);
  }
  .cmdk-ic {
    flex: none;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--bg-raised) 88%, transparent);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .cmdk-row.on .cmdk-ic {
    border-color: color-mix(in oklab, var(--accent) 36%, var(--border));
  }
  .cmdk-ic img {
    width: 1.3rem;
    height: 1.3rem;
    object-fit: contain;
  }
  .cmdk-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  .cmdk-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmdk-sub {
    font-size: 0.74rem;
    color: var(--text-muted);
  }
  .cmdk-tag {
    flex: none;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .cmdk-row.on .cmdk-tag {
    color: var(--accent-bright);
  }
</style>
