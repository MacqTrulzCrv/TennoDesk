<script lang="ts">
  import { withRowKeys } from "../../lib/widgets/rows.js";
  import { dashboardLayout, settingNumber, widgetSettings } from "../../stores/dashboard.js";
  import { worldData, worldLoading } from "../../stores/world.js";
  import type { NightwaveChallenge } from "../../types/world.js";
  import WidgetFrame from "./WidgetFrame.svelte";

  const settings = $derived(widgetSettings($dashboardLayout, "widget.nightwave"));
  const limit = $derived(settingNumber(settings, "limit", 6));

  const wd = $derived($worldData);
  const nightwave = $derived(wd?.nightwave ?? null);

  // Daily first (the fastest standing), then weekly, with elite weeklies last;
  // the group a challenge belongs to is color-coded on its title below.
  function rank(challenge: NightwaveChallenge): number {
    return challenge.isDaily ? 0 : challenge.isElite ? 2 : 1;
  }
  const challenges = $derived(
    [...(nightwave?.challenges ?? [])].sort(
      (a, b) => rank(a) - rank(b) || (b.standing ?? 0) - (a.standing ?? 0),
    ),
  );
  const shown = $derived(withRowKeys(challenges.slice(0, limit), (challenge) => challenge.id));

  function titleTone(challenge: NightwaveChallenge): string {
    if (challenge.isDaily) return "text-text-primary";
    if (challenge.isElite) return "text-warning";
    return "text-text-secondary";
  }
</script>

<WidgetFrame
  widgetId="widget.nightwave"
  loading={$worldLoading && !wd}
  empty={challenges.length === 0}
  emptyKey={wd ? "world.noData" : "world.unavailable"}
  overflow={challenges.length - shown.length}
>
  <ul class="m-0 max-h-[340px] flex-1 list-none overflow-y-auto p-0">
    {#each shown as challenge (challenge.rowKey)}
      <li class="flex items-baseline gap-2 py-1 text-sm">
        <span class="min-w-0 flex-1 truncate {titleTone(challenge)}">{challenge.title}</span>
        {#if challenge.standing != null}
          <span class="shrink-0 font-display tabular-nums text-text-muted"
            >+{challenge.standing.toLocaleString()}</span
          >
        {/if}
      </li>
    {/each}
  </ul>
</WidgetFrame>
