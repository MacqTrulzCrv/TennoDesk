<script context="module" lang="ts">
  export type SummaryStripItem = {
    key: string;
    label: string;
    value: string | number;
    tone?: "default" | "success" | "warning" | "danger";
    icon?: string | null;
    subtext?: string;
    subtextTone?: "default" | "success" | "warning" | "danger";
    /** Recent values (oldest→newest) drawn as a tiny trend sparkline under the figure. */
    spark?: number[];
  };
</script>

<script lang="ts">
  import ThemedPanel from "./ThemedPanel.svelte";

  export let items: SummaryStripItem[] = [];
  export let variant: "stats" | "mastery" | "grid" = "stats";

  function toneClass(tone: SummaryStripItem["tone"]): string {
    if (tone === "success") return "text-success";
    if (tone === "warning") return "text-warning";
    if (tone === "danger") return "text-danger";
    return "text-text-primary";
  }

  function subtextToneClass(tone: SummaryStripItem["subtextTone"]): string {
    return tone && tone !== "default" ? toneClass(tone) : "text-text-secondary";
  }

  // Normalise a series into polyline points inside a fixed viewBox; the last
  // point is returned separately so a marker dot can sit on the latest value.
  const SPARK_W = 76;
  const SPARK_H = 20;
  function sparkGeometry(
    values: number[],
  ): { points: string; lastX: number; lastY: number } | null {
    if (!values || values.length < 2) return null;
    const pad = 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = (SPARK_W - pad * 2) / (values.length - 1);
    const coords = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (SPARK_H - pad * 2) * (1 - (v - min) / span);
      return [x, y] as const;
    });
    const last = coords[coords.length - 1];
    return {
      points: coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      lastX: last[0],
      lastY: last[1],
    };
  }
</script>

<ThemedPanel
  className={variant === "mastery"
    ? "w-fit max-w-full min-w-0 px-7 py-5"
    : variant === "grid"
      ? "px-2 py-4"
      : "flex flex-wrap items-stretch gap-y-2 px-4 py-3"}
>
  <div
    class={variant === "grid"
      ? "grid overflow-hidden [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-y-4"
      : variant === "mastery"
        ? "flex flex-wrap items-stretch gap-y-4 overflow-hidden"
        : "contents"}
    data-summary-strip={variant}
  >
    {#each items as item, index (item.key)}
      {#if index > 0 && variant === "stats"}
        <span class="self-stretch w-px bg-[color:var(--ui-panel-border)]" aria-hidden="true"></span>
      {/if}

      {#if variant === "grid"}
        <!-- The grid clips separators at the start of each wrapped row. -->
        <div
          class="relative flex min-w-0 flex-col gap-1.5 px-6 text-center before:absolute before:-left-px before:top-0 before:h-full before:w-px before:bg-[color:var(--ui-panel-border)] after:absolute after:-top-2 after:left-0 after:h-px after:w-full after:bg-[color:var(--ui-panel-border)]"
          data-summary-item={item.key}
        >
          <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {item.label}
          </span>
          <span
            class="font-display [overflow-wrap:anywhere] text-3xl font-bold leading-none {toneClass(
              item.tone,
            )}"
          >
            {item.value}
          </span>
          {#if item.spark}
            {@const geo = sparkGeometry(item.spark)}
            {#if geo}
              <svg
                viewBox="0 0 {SPARK_W} {SPARK_H}"
                class="mt-0.5 h-5 w-[76px] self-center overflow-visible opacity-80"
                aria-hidden="true"
              >
                <polyline
                  points={geo.points}
                  fill="none"
                  stroke="var(--accent)"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                />
                <circle cx={geo.lastX} cy={geo.lastY} r="1.6" fill="var(--accent-bright)" />
              </svg>
            {/if}
          {/if}
          {#if item.subtext}
            <span class="text-xs font-semibold {subtextToneClass(item.subtextTone)}"
              >{item.subtext}</span
            >
          {/if}
        </div>
      {:else if variant === "mastery"}
        <div
          class="relative flex flex-col justify-center gap-1 px-6 before:absolute before:-left-px before:top-0 before:h-full before:w-px before:bg-[color:var(--ui-panel-border)]"
          data-summary-item={item.key}
        >
          <div class="flex items-center gap-4">
            <span class="font-display text-5xl font-bold leading-none {toneClass(item.tone)}"
              >{item.value}</span
            >
            <span class="text-2xl font-semibold text-text-secondary">{item.label}</span>
          </div>
          {#if item.subtext}
            <span class="text-lg font-semibold {subtextToneClass(item.subtextTone)}"
              >{item.subtext}</span
            >
          {/if}
        </div>
      {:else}
        <!-- min-w-fit so nowrap cells never paint into their neighbor -->
        <div class="flex min-w-fit flex-1 items-center gap-2.5 px-3.5">
          {#if item.icon}
            <img src={item.icon} alt="" class="h-8 w-8 shrink-0 object-contain opacity-90" />
          {/if}
          <div class="flex flex-1 flex-col gap-1">
            <div class="flex items-baseline gap-2 flex-wrap">
              <!-- nowrap so labels can't collide with values in image captures -->
              <span
                class="whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-text-primary"
              >
                {item.label}
              </span>
              <span
                class="whitespace-nowrap text-xl font-bold leading-none tracking-tight {toneClass(
                  item.tone,
                )}"
              >
                {item.value}
              </span>
              {#if item.spark}
                {@const geo = sparkGeometry(item.spark)}
                {#if geo}
                  <svg
                    viewBox="0 0 {SPARK_W} {SPARK_H}"
                    class="h-4 w-[76px] self-center overflow-visible opacity-80"
                    aria-hidden="true"
                  >
                    <polyline
                      points={geo.points}
                      fill="none"
                      stroke="var(--accent)"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                    />
                    <circle cx={geo.lastX} cy={geo.lastY} r="1.6" fill="var(--accent-bright)" />
                  </svg>
                {/if}
              {/if}
            </div>
            {#if item.subtext}
              <span class="text-xs font-semibold {subtextToneClass(item.subtextTone)}"
                >{item.subtext}</span
              >
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</ThemedPanel>
