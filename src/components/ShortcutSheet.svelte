<script lang="ts">
  import { tr, type MessageKey } from "../lib/i18n.js";
  import { overlaySettings } from "../stores/overlaySettings.js";
  import { shortcutSheetOpen, closeShortcutSheet } from "../stores/shortcutSheet.js";

  const APP_ROWS: { labelKey: MessageKey; keys: string }[] = [
    { labelKey: "nav.quickSwitch", keys: "Ctrl K" },
    { labelKey: "shortcuts.search", keys: "Ctrl F" },
    { labelKey: "shortcuts.close", keys: "Esc" },
    { labelKey: "shortcuts.title", keys: "?" },
  ];

  const overlayRows = $derived<{ labelKey: MessageKey; keys: string }[]>([
    { labelKey: "shortcuts.overlayReward", keys: $overlaySettings.hotkey },
    { labelKey: "shortcuts.overlayInteract", keys: $overlaySettings.interactionHotkey },
    { labelKey: "shortcuts.overlayRiven", keys: $overlaySettings.rivenRescanHotkey },
    { labelKey: "shortcuts.overlayRivenToggle", keys: $overlaySettings.rivenToggleHotkey },
    { labelKey: "shortcuts.overlayRep", keys: $overlaySettings.tradeRepHotkey },
    { labelKey: "shortcuts.overlayPlanner", keys: $overlaySettings.plannerToggleHotkey },
  ]);
</script>

{#if $shortcutSheetOpen}
  <button
    type="button"
    class="ss-backdrop"
    aria-label={$tr("common.close")}
    onclick={closeShortcutSheet}
  ></button>
  <div class="ss" role="dialog" aria-modal="true" aria-label={$tr("shortcuts.title")}>
    <div class="ss-head">
      <span class="ss-title">{$tr("shortcuts.title")}</span>
      <kbd>?</kbd>
    </div>
    <div class="ss-body">
      <section class="ss-group">
        <h4 class="ss-group-label">{$tr("shortcuts.appGroup")}</h4>
        {#each APP_ROWS as row (row.labelKey)}
          <div class="ss-row">
            <span class="ss-row-label">{$tr(row.labelKey)}</span>
            <kbd>{row.keys}</kbd>
          </div>
        {/each}
      </section>
      <section class="ss-group">
        <h4 class="ss-group-label">{$tr("shortcuts.overlayGroup")}</h4>
        {#each overlayRows as row (row.labelKey)}
          <div class="ss-row">
            <span class="ss-row-label">{$tr(row.labelKey)}</span>
            <kbd>{row.keys}</kbd>
          </div>
        {/each}
      </section>
    </div>
  </div>
{/if}

<style>
  .ss-backdrop {
    position: fixed;
    inset: var(--titlebar-height) 0 0 0;
    z-index: 1200;
    border: 0;
    cursor: default;
    background: color-mix(in oklab, var(--bg-deep) 62%, transparent);
    backdrop-filter: blur(2px);
  }
  .ss {
    position: fixed;
    z-index: 1210;
    left: 50%;
    top: calc(var(--titlebar-height) + 10vh);
    transform: translateX(-50%);
    width: min(460px, calc(100vw - 3rem));
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in oklab, var(--accent) 24%, var(--border-strong));
    border-radius: var(--radius-xl);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--bg-surface) 96%, white 3%),
      var(--bg-base)
    );
    box-shadow:
      0 40px 90px -30px color-mix(in oklab, black 75%, transparent),
      0 0 40px -18px var(--accent-glow);
    overflow: hidden;
  }
  .ss-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.85rem 1.1rem;
    border-bottom: 1px solid var(--border);
  }
  .ss-title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--text-primary);
  }
  .ss-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.9rem 1.1rem 1.1rem;
    max-height: 60vh;
    overflow-y: auto;
  }
  .ss-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ss-group-label {
    margin: 0 0 0.2rem;
    font-family: var(--font-display);
    font-size: 0.66rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .ss-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.3rem 0;
  }
  .ss-row-label {
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  kbd {
    flex: none;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    color: var(--text-secondary);
    background: color-mix(in oklab, var(--bg-raised) 90%, transparent);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    padding: 0.14rem 0.5rem;
  }
</style>
