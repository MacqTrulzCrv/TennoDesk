<script lang="ts">
  import ModalShell from "./ModalShell.svelte";
  import { locale, tr } from "../lib/i18n.js";
  import { parseReleaseNotes } from "../lib/releaseNotes.js";
  import { DISCORD_INVITE_URL } from "../data/community.js";
  import type { AppUpdateState } from "../types/ipc.js";

  /** Live update state (version, status, release notes). */
  export let state: AppUpdateState;
  /** A download/install IPC call is in flight. */
  export let pending = false;
  export let onClose: () => void;
  export let onDownload: () => void;
  export let onInstall: () => void;

  $: blocks = state.releaseNotes ? parseReleaseNotes(state.releaseNotes) : [];
  $: version = state.version || state.releaseName || "";
  $: percent = Math.round(state.percent || 0);
  $: dateLabel = formatDate(state.releaseDate);

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString($locale, { year: "numeric", month: "short", day: "numeric" });
  }

  function openLink(href: string | undefined): void {
    if (href) window.api?.openExternal?.(href);
  }
</script>

<ModalShell ariaLabel={$tr("update.whatsNew")} {onClose}>
  <div class="detail-panel update-modal-panel">
    <div class="detail-panel-top-actions">
      <button
        type="button"
        class="detail-close"
        aria-label={$tr("update.closeDialog")}
        on:click={onClose}>&times;</button
      >
    </div>

    <div class="detail-header">
      <div class="detail-title-area">
        <h2>{version ? $tr("update.whatsNewIn", { version }) : $tr("update.whatsNew")}</h2>
        {#if dateLabel}
          <p class="update-modal-date">{$tr("update.released", { date: dateLabel })}</p>
        {/if}
      </div>
    </div>

    <div class="detail-body update-modal-body">
      {#if blocks.length}
        <div class="update-notes">
          {#each blocks as block}
            {#if block.kind === "heading"}
              <p class="update-notes-heading" class:is-h1={block.level <= 1}>
                {#each block.segments as seg}{#if seg.kind === "link"}<a
                      href={seg.href}
                      on:click|preventDefault={() => openLink(seg.href)}>{seg.text}</a
                    >{:else if seg.kind === "bold"}<strong>{seg.text}</strong
                    >{:else}{seg.text}{/if}{/each}
              </p>
            {:else if block.kind === "list"}
              <ul class="update-notes-list">
                {#each block.items as item}
                  <li>
                    {#each item as seg}{#if seg.kind === "link"}<a
                          href={seg.href}
                          on:click|preventDefault={() => openLink(seg.href)}>{seg.text}</a
                        >{:else if seg.kind === "bold"}<strong>{seg.text}</strong
                        >{:else}{seg.text}{/if}{/each}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="update-notes-para">
                {#each block.segments as seg}{#if seg.kind === "link"}<a
                      href={seg.href}
                      on:click|preventDefault={() => openLink(seg.href)}>{seg.text}</a
                    >{:else if seg.kind === "bold"}<strong>{seg.text}</strong
                    >{:else}{seg.text}{/if}{/each}
              </p>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="update-notes-empty">
          {$tr("update.noReleaseNotes")}
        </p>
      {/if}

      {#if state.status === "downloading"}
        <div class="update-progress" aria-label={$tr("update.downloadProgress")}>
          <div class="update-progress-bar" style={`width:${percent}%`}></div>
        </div>
        <p class="update-progress-label">{$tr("update.downloading", { percent })}</p>
      {:else if state.status === "error" && state.message}
        <p class="update-error">{state.message}</p>
      {/if}
    </div>

    <div class="update-modal-footer">
      <button
        type="button"
        class="update-discord-link"
        data-update-discord
        on:click={() => openLink(DISCORD_INVITE_URL)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="update-discord-icon" aria-hidden="true">
          <path
            d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"
          />
        </svg>
        {$tr("update.discord")}
      </button>
      <div class="update-modal-actions">
        {#if state.status === "available"}
          <button type="button" class="btn-success btn-sm" disabled={pending} on:click={onDownload}>
            {$tr("update.download", { version: version || $tr("update.updateFallback") })}
          </button>
        {:else if state.status === "downloaded"}
          <button type="button" class="btn-success btn-sm" disabled={pending} on:click={onInstall}>
            {$tr("update.restartAndInstall")}
          </button>
        {/if}
        <button type="button" class="btn-secondary btn-sm" on:click={onClose}
          >{$tr("common.close")}</button
        >
      </div>
    </div>
  </div>
</ModalShell>

<style>
  .update-modal-panel {
    max-width: 48rem;
    width: min(48rem, 92vw);
  }
  .update-modal-date {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .update-modal-body {
    max-height: 65vh;
    overflow-y: auto;
  }
  .update-notes {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }
  .update-notes-heading {
    font-weight: 600;
    font-size: 1rem;
    color: var(--text-primary);
    margin-top: 0.35rem;
  }
  .update-notes-heading.is-h1 {
    font-size: 1.15rem;
  }
  .update-notes-list {
    list-style: disc;
    padding-left: 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .update-notes :global(a) {
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .update-notes-empty {
    font-size: 0.95rem;
    color: var(--text-muted);
  }
  .update-progress {
    margin-top: 0.9rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--ui-control-bg);
    overflow: hidden;
  }
  .update-progress-bar {
    height: 100%;
    background: var(--success);
    transition: width 0.2s ease;
  }
  .update-progress-label {
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .update-error {
    margin-top: 0.9rem;
    font-size: 0.8rem;
    color: var(--danger);
  }
  /* The body's own 1rem bottom padding is the gap to the notes, so the footer
     only carries the panel gutter other modals get from .detail-body. */
  .update-modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }
  .update-modal-actions {
    display: flex;
    gap: 0.5rem;
  }
  .update-discord-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8rem;
    color: var(--text-muted);
    transition: color 0.15s ease;
  }
  .update-discord-link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .update-discord-icon {
    width: 1rem;
    height: 1rem;
    flex: none;
  }
</style>
