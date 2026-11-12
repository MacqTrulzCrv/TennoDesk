<script lang="ts">
  import { PLATINUM_ICON_URL, STAT_ICON_URLS } from "../../lib/assetUrls.js";
  import { locale, tr, type Translator } from "../../lib/i18n.js";
  import { countUp } from "../../lib/countUp.js";
  import {
    VALUE_MIN_PLATINUM_PRESETS,
    selectValueStripRows,
    type InventoryValueTotals,
  } from "../../lib/inventory/valueTotals.js";

  interface Props {
    /** Totals for the rows the tab, its chips and the filters currently show. */
    inView: InventoryValueTotals;
    /** Totals for the whole inventory in the same valuation scope. */
    inventory: InventoryValueTotals;
    allTradables: boolean;
    /** False on tabs with no prime rows, where the prime lens has nothing to
     *  narrow to; the button is disabled so it never empties the list. */
    primeApplicable?: boolean;
    onSelectScope: (allTradables: boolean) => void;
    /** Per-unit platinum floor applied to both figures; 0 is off. */
    minPlatinum: number;
    onSelectMinPlatinum: (minPlatinum: number) => void;
  }

  let {
    inView,
    inventory,
    allTradables,
    primeApplicable = true,
    onSelectScope,
    minPlatinum,
    onSelectMinPlatinum,
  }: Props = $props();

  const PLAT_ICON = PLATINUM_ICON_URL;
  const DUCAT_ICON = STAT_ICON_URLS.ducatsDelta;

  const rows = $derived(
    selectValueStripRows(inView, inventory).map((key) => ({
      key,
      label:
        key === "inView" ? $tr("inventory.value.inView") : $tr("inventory.value.wholeInventory"),
      totals: key === "inView" ? inView : inventory,
    })),
  );

  // A hole means the real total is higher, so the figure reads as a floor. The
  // translator is a parameter because Svelte only tracks $tr where it is textual.
  function figure(value: number, unpriced: number, code: string, t: Translator): string {
    const amount = value.toLocaleString(code);
    return unpriced > 0 ? t("inventory.value.atLeast", { value: amount }) : amount;
  }

  function hasDucats(totals: InventoryValueTotals): boolean {
    return totals.ducats > 0 || totals.ducatsUnpriced > 0;
  }
</script>

{#if rows.length > 0}
  <div
    class="mt-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2"
    data-inventory-value-strip
    title={$tr("inventory.value.hint")}
  >
    <span class="text-xs font-semibold tracking-wide text-text-muted uppercase">
      {$tr("inventory.value.title")}
    </span>

    {#each rows as row, index (row.key)}
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-value-scope={row.key}>
        <span
          class="text-xs font-semibold {index === 0 ? 'text-text-secondary' : 'text-text-muted'}"
        >
          {row.label}
        </span>
        <span
          class="inline-flex items-baseline gap-1 font-display font-bold {index === 0
            ? 'text-base text-accent-bright'
            : 'text-sm text-text-secondary'}"
          data-value-platinum
        >
          <img src={PLAT_ICON} alt="" class="h-3.5 w-3.5 shrink-0 self-center object-contain" />
          <span
            use:countUp={{
              value: row.totals.platinum,
              format: (n) => figure(Math.round(n), row.totals.platinumUnpriced, $locale, $tr),
            }}
          ></span>
        </span>
        {#if hasDucats(row.totals)}
          <span
            class="inline-flex items-baseline gap-1 font-display font-bold {index === 0
              ? 'text-base text-accent'
              : 'text-sm text-text-secondary'}"
            data-value-ducats
          >
            <img src={DUCAT_ICON} alt="" class="h-3.5 w-3.5 shrink-0 self-center object-contain" />
            <span
              use:countUp={{
                value: row.totals.ducats,
                format: (n) => figure(Math.round(n), row.totals.ducatsUnpriced, $locale, $tr),
              }}
            ></span>
          </span>
        {/if}
        {#if index === 0 && row.totals.unpriced > 0}
          <span class="text-[11px] text-text-muted" data-value-unpriced>
            {$tr("inventory.value.unpriced", { count: row.totals.unpriced })}
          </span>
        {/if}
      </div>
    {/each}

    <!-- Deliberately smaller and dimmer than the filter tabs below: this lens
         narrows the open tab to prime rows (and steers the counter with it), so
         it is kept visually distinct from the list's own filter tabs. On a tab
         with no prime rows the prime option is disabled - there is nothing to
         narrow to. -->
    <div
      class="inline-flex overflow-hidden rounded border border-border/60"
      data-value-scope-toggle
    >
      <button
        type="button"
        class="px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.04em] {!allTradables &&
        primeApplicable
          ? 'bg-accent-glow text-accent'
          : 'bg-transparent text-text-muted hover:text-text-secondary'} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-muted"
        aria-pressed={!allTradables && primeApplicable}
        disabled={!primeApplicable}
        data-value-scope-option="prime"
        title={primeApplicable
          ? $tr("inventory.value.scopePrimeHint")
          : $tr("inventory.value.scopePrimeUnavailable")}
        onclick={() => onSelectScope(false)}
      >
        {$tr("inventory.value.scopePrime")}
      </button>
      <button
        type="button"
        class="border-l border-border/60 px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.04em] {allTradables ||
        !primeApplicable
          ? 'bg-accent-glow text-accent'
          : 'bg-transparent text-text-muted hover:text-text-secondary'}"
        aria-pressed={allTradables || !primeApplicable}
        data-value-scope-option="tradable"
        title={$tr("inventory.value.allTradablesHint")}
        onclick={() => onSelectScope(true)}
      >
        {$tr("inventory.value.allTradables")}
      </button>
    </div>

    <!-- The title sits on the group so all four buttons show it; browsers walk
         up to the nearest titled ancestor. -->
    <div
      class="inline-flex items-center gap-0.5 overflow-hidden rounded border border-border/60 px-1"
      data-value-min-plat-toggle
      title={$tr("inventory.value.minPlatHint")}
    >
      <img src={PLAT_ICON} alt="" class="h-3 w-3 shrink-0 self-center object-contain opacity-60" />
      {#each VALUE_MIN_PLATINUM_PRESETS as preset (preset)}
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-display text-[11px] {minPlatinum === preset
            ? 'bg-accent-glow text-accent'
            : 'bg-transparent text-text-muted hover:text-text-secondary'}"
          aria-pressed={minPlatinum === preset}
          aria-label={preset === 0
            ? $tr("inventory.value.minPlatOff")
            : $tr("inventory.value.minPlatOption", { value: preset })}
          data-value-min-plat-option={preset}
          onclick={() => onSelectMinPlatinum(preset)}
        >
          {preset === 0 ? $tr("inventory.value.minPlatOff") : `${preset.toLocaleString($locale)}+`}
        </button>
      {/each}
    </div>
  </div>
{/if}
