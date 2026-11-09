<script lang="ts">
  export let label: string;
  export let options: Array<{ key: string; label: string }> = [];
  /** Keys switched on; callers persist the complement so later additions default on. */
  export let enabled: ReadonlySet<string>;
  export let onToggle: (key: string) => void;
  /** Identifies this row for tests; individual chips carry data-chip. */
  export let rowName: string;
  /**
   * "chips" is the default pill row. "segment" renders a connected segmented
   * control so a scope/include row reads as a filter, not a second tab bar.
   */
  export let variant: "chips" | "segment" = "chips";
</script>

{#if options.length > 0}
  <div class="shared-chip-group shared-chip-group--wrap mb-2 w-fit" data-chip-row={rowName}>
    <span class="shared-chip-label">{label}</span>
    {#if variant === "segment"}
      <div class="inline-flex overflow-hidden rounded border border-border/60" role="group">
        {#each options as option, index (option.key)}
          <button
            type="button"
            class="px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.04em] {index > 0
              ? 'border-l border-border/60'
              : ''} {enabled.has(option.key)
              ? 'bg-accent-glow text-accent'
              : 'bg-transparent text-text-muted hover:text-text-secondary'}"
            class:active={enabled.has(option.key)}
            aria-pressed={enabled.has(option.key)}
            data-chip={option.key}
            on:click={() => onToggle(option.key)}>{option.label}</button
          >
        {/each}
      </div>
    {:else}
      <div class="filter-tabs">
        {#each options as option (option.key)}
          <button
            class="filter-tab"
            class:active={enabled.has(option.key)}
            aria-pressed={enabled.has(option.key)}
            data-chip={option.key}
            on:click={() => onToggle(option.key)}>{option.label}</button
          >
        {/each}
      </div>
    {/if}
  </div>
{/if}
