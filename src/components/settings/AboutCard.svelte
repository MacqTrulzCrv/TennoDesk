<script lang="ts">
  import { onMount } from "svelte";
  import { locale, tr } from "../../lib/i18n.js";
  import { invoke, on } from "../../lib/ipc.js";
  import type { RelicDataInfo } from "../../../config/shared/relicDataInfo.js";
  import SettingsSection from "./SettingsSection.svelte";
  import { DISCORD_INVITE_URL } from "../../data/community.js";

  const appVersion = import.meta.env.VITE_APP_VERSION || "?";
  const discordInviteShort = DISCORD_INVITE_URL.replace(/^https?:\/\//, "");

  function openDiscord(): void {
    window.api?.openExternal?.(DISCORD_INVITE_URL);
  }

  let relicData = $state<RelicDataInfo | null>(null);

  function loadRelicDataInfo(): void {
    invoke("getRelicDataInfo")
      .then((info) => (relicData = info))
      .catch((err) => console.warn("[About] getRelicDataInfo failed:", err));
  }

  onMount(() => {
    loadRelicDataInfo();
    return on("relic-db-updated", loadRelicDataInfo);
  });

  const relicPublishedDate = $derived.by(() => {
    const published = relicData?.source === "downloaded" ? relicData.publishedAt : null;
    if (!published) return null;
    return new Date(published).toLocaleDateString($locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  });
  const relicDataValue = $derived(
    !relicData?.version
      ? null
      : relicPublishedDate
        ? $tr("settings.creditRelicDataValue", {
            version: relicData.version,
            date: relicPublishedDate,
          })
        : relicData.version,
  );

  type InfoRow = { label: string; value: string; id?: string };

  // Rebuilt on a language switch so the row labels follow the active locale.
  const infoRows: InfoRow[] = $derived([
    { label: $tr("settings.creditGameData"), value: $tr("settings.creditGameDataValue") },
    ...(relicDataValue
      ? [{ id: "relic-data", label: $tr("settings.creditRelicData"), value: relicDataValue }]
      : []),
  ]);
</script>

<SettingsSection title={$tr("settings.aboutTitle")} description={$tr("settings.aboutDesc")}>
  {#snippet aside()}
    <span
      class="shrink-0 rounded bg-bg-raised px-2 py-0.5 font-display text-xs font-semibold text-text-secondary"
      >v{appVersion}</span
    >
  {/snippet}

  <div class="mt-2.5 grid gap-1">
    {#each infoRows as row}
      <div class="settings-credit-row" data-credit={row.id}>
        <span>{row.label}</span>
        <span class="settings-credit-value">{row.value}</span>
      </div>
    {/each}
    <button
      type="button"
      class="settings-credit-row settings-discord-row"
      data-credit="discord"
      onclick={openDiscord}
    >
      <span>{$tr("settings.discordLabel")}</span>
      <span class="settings-credit-value settings-discord-value">{discordInviteShort}</span>
    </button>
  </div>

  <p class="m-0 mt-2.5 text-xs leading-snug text-text-muted">
    {$tr("settings.footerDisclaimer")}
  </p>
</SettingsSection>

<style>
  /* Wrapping makes a flex line break on the children's max-content widths, so a
     narrow card drops the value under the label instead of squeezing both into
     ragged two-line columns. */
  .settings-credit-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.1rem 0.7rem;
    border-radius: var(--radius-md);
    padding: 0.34rem 0.45rem;
    margin: 0 -0.45rem;
  }
  /* Keeps the value at the right edge once it is alone on the wrapped line. */
  .settings-credit-row > :last-child {
    margin-left: auto;
  }
  .settings-credit-row:hover {
    background: var(--bg-hover);
  }
  .settings-credit-row > span:first-child {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
  }
  .settings-credit-value {
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  .settings-discord-row {
    width: calc(100% + 0.9rem);
    border: 0;
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .settings-discord-value {
    color: var(--accent);
  }
  .settings-discord-row:hover .settings-discord-value {
    text-decoration: underline;
  }
</style>
