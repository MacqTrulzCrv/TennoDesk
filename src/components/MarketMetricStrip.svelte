<script lang="ts">
  import { PLATINUM_ICON_URL, STAT_ICON_URLS } from "../lib/assetUrls.js";
  import { tr } from "../lib/i18n.js";
  import { valueTier } from "../lib/inventory/valueTotals.js";

  type MetricValue = number | string | null | undefined;
  type MetricState = "has-value" | "loading" | "no-data";

  export let platinum: MetricValue = null;
  export let ducats: MetricValue = null;
  export let ratio: MetricValue = null;
  export let showDucats = true;
  export let state: MetricState = "no-data";
  export let size: "default" | "compact" = "default";
  // Inventory cards enlarge the platinum value so the "money" number leads;
  // other call sites keep every metric the same weight.
  export let emphasizePrimary = false;
  export let wrap = true;
  export let justify: "start" | "end" = "start";
  export let className = "";

  const PLAT_ICON = PLATINUM_ICON_URL;
  const DUCAT_ICON = STAT_ICON_URLS.ducatsDelta;

  function hasValue(value: MetricValue): boolean {
    return value !== null && value !== undefined && value !== "";
  }

  // A metric with no value shows the loading skeleton only while a fetch is in
  // flight; once it settles with nothing it must drop to the dash.
  function isLoadingPlaceholder(value: MetricValue, metricState: MetricState): boolean {
    return metricState === "loading" && !hasValue(value);
  }

  // Reads `metricState` so the label re-renders when a lookup resolves to no
  // data rather than staying stuck on the placeholder.
  function valueLabel(value: MetricValue, metricState: MetricState): string {
    if (hasValue(value)) return `${value}`;
    return metricState === "loading" ? "" : "-";
  }

  function toneClass(value: MetricValue, tone: "plat" | "ducat"): string {
    if (!hasValue(value)) return "text-text-muted";
    if (tone === "ducat") return "text-accent";
    // Platinum scales with value: cheap stock stays quiet, pricey stock pops.
    const numeric = typeof value === "number" ? value : Number(value);
    const tier = valueTier(Number.isFinite(numeric) ? numeric : null);
    return tier === "high"
      ? "text-accent-bright"
      : tier === "mid"
        ? "text-accent"
        : "text-text-secondary";
  }

  $: textSizeClass = size === "compact" ? "text-sm" : "text-base";
  $: platTextSizeClass = emphasizePrimary
    ? size === "compact"
      ? "text-base"
      : "text-lg"
    : textSizeClass;
  $: iconSizeClass = size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";
  $: rootGapClass = size === "compact" ? "gap-x-2 gap-y-0.5" : "gap-x-3 gap-y-1";
  $: rootHeightClass = size === "compact" ? "min-h-0" : "min-h-7";
  $: rootWrapClass = wrap ? "flex-wrap" : "flex-nowrap";
  $: rootJustifyClass = justify === "end" ? "justify-end" : "justify-start";
</script>

<div
  class="flex {rootWrapClass} {rootJustifyClass} items-center {rootGapClass} {rootHeightClass} {className}"
>
  <span
    class="inline-flex items-center gap-1 font-display font-bold tracking-[0.02em] {platTextSizeClass} {toneClass(
      platinum,
      'plat',
    )}"
    title={$tr("common.platinum")}
  >
    <img src={PLAT_ICON} alt="" class="{iconSizeClass} object-contain shrink-0" />
    {#if isLoadingPlaceholder(platinum, state)}<span
        class="metric-skeleton"
        title={$tr("common.loading")}
      ></span>{:else}{valueLabel(platinum, state)}{/if}
  </span>

  {#if showDucats}
    <span
      class="inline-flex items-center gap-1 font-display font-bold tracking-[0.02em] {textSizeClass} {toneClass(
        ducats,
        'ducat',
      )}"
      title={$tr("common.ducats")}
    >
      <img src={DUCAT_ICON} alt="" class="{iconSizeClass} object-contain shrink-0" />
      {#if isLoadingPlaceholder(ducats, state)}<span
          class="metric-skeleton"
          title={$tr("common.loading")}
        ></span>{:else}{valueLabel(ducats, state)}{/if}
    </span>

    <span
      class="inline-flex items-center gap-0.5 font-display font-bold tracking-[0.02em] {textSizeClass} {toneClass(
        ratio,
        'ducat',
      )}"
      title={$tr("market.ducatsPerPlatinum")}
    >
      <img src={DUCAT_ICON} alt="" class="{iconSizeClass} object-contain shrink-0" />
      <span aria-hidden="true" class="text-text-muted text-[0.8em]">/</span>
      <img src={PLAT_ICON} alt="" class="{iconSizeClass} object-contain shrink-0 mr-1" />
      {#if isLoadingPlaceholder(ratio, state)}<span
          class="metric-skeleton"
          title={$tr("common.loading")}
        ></span>{:else}{valueLabel(ratio, state)}{/if}
    </span>
  {/if}
</div>

<style>
  /* Shimmer placeholder shown while a price is still being fetched, so an
     unresolved value reads as "loading" rather than "no listing exists". */
  .metric-skeleton {
    display: inline-block;
    width: 2.4ch;
    height: 0.82em;
    border-radius: 3px;
    vertical-align: middle;
    background: linear-gradient(
      90deg,
      color-mix(in oklab, var(--text-primary) 6%, transparent) 25%,
      color-mix(in oklab, var(--text-primary) 16%, transparent) 37%,
      color-mix(in oklab, var(--text-primary) 6%, transparent) 63%
    );
    background-size: 400% 100%;
    animation: metric-skeleton-shimmer 1.3s ease-in-out infinite;
  }
  @keyframes metric-skeleton-shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .metric-skeleton {
      animation: none;
    }
  }
</style>
