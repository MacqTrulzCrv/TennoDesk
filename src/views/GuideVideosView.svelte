<script lang="ts">
  import { tr, type MessageKey } from "../lib/i18n.js";

  // Bundled guide videos are served over the privileged `tdvideo://` scheme the
  // main process registers; the basename maps to resources/guide-videos/<file>.
  const videoUrl = (file: string) => `tdvideo://local/${file}`;

  interface GuideVideo {
    file: string;
    titleKey: MessageKey;
    duration: string;
    featured?: boolean;
  }

  const VIDEOS: GuideVideo[] = [
    { file: "00-genel-tanitim.mp4", titleKey: "guides.v0", duration: "15:30", featured: true },
    { file: "01-envanter.mp4", titleKey: "guides.v1", duration: "5:56" },
    { file: "02-analiz.mp4", titleKey: "guides.v2", duration: "4:34" },
    { file: "03-piyasa.mp4", titleKey: "guides.v3", duration: "3:55" },
    { file: "04-dunya.mp4", titleKey: "guides.v4", duration: "3:08" },
    { file: "05-panel.mp4", titleKey: "guides.v5", duration: "2:07" },
    { file: "06-araclar.mp4", titleKey: "guides.v6", duration: "2:45" },
  ];

  const featured = VIDEOS.find((v) => v.featured)!;
  const chapters = VIDEOS.filter((v) => !v.featured);

  let selected = $state<GuideVideo>(featured);
  let player = $state<HTMLVideoElement | null>(null);

  function pick(video: GuideVideo): void {
    selected = video;
    // The src attribute updates reactively; reload the element, then bring it
    // into view and start playback.
    queueMicrotask(() => {
      player?.load();
      player?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      void player?.play().catch(() => {});
    });
  }
</script>

<div class="h-full overflow-y-auto px-6 py-5" data-view="guides">
  <header class="mb-5">
    <h1 class="m-0 font-display text-2xl font-semibold tracking-wide text-text-primary">
      {$tr("guides.title")}
    </h1>
    <p class="mt-1 max-w-[52rem] text-sm leading-relaxed text-text-muted">
      {$tr("guides.subtitle")}
      <span
        class="ml-2 whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2 py-[2px] text-xs text-accent"
        >{$tr("guides.trNote")}</span
      >
    </p>
  </header>

  <!-- Active player -->
  <div
    data-guides-player
    class="mx-auto mb-6 w-full max-w-[64rem] overflow-hidden rounded-lg border border-border bg-black shadow-lg"
  >
    <video
      bind:this={player}
      controls
      preload="metadata"
      class="block aspect-video w-full bg-black"
      src={videoUrl(selected.file)}
    >
      <track kind="captions" />
    </video>
    <div class="flex items-center justify-between gap-3 px-4 py-2.5">
      <span class="truncate text-sm font-semibold text-text-primary">{$tr(selected.titleKey)}</span>
      <span class="shrink-0 text-xs tabular-nums text-text-muted">{selected.duration}</span>
    </div>
  </div>

  <!-- Featured / full walkthrough -->
  <section class="mb-6">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
      {$tr("guides.featuredLabel")}
    </h2>
    <button
      type="button"
      onclick={() => pick(featured)}
      data-guides-item={featured.file}
      class="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-[border-color,background] duration-150 hover:border-border-strong hover:bg-bg-raised {selected.file ===
      featured.file
        ? 'border-accent bg-accent/5'
        : 'border-border bg-surface-card'}"
    >
      <span
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
        aria-hidden="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-display text-base font-semibold text-text-primary">
          {$tr(featured.titleKey)}
        </span>
        <span class="mt-0.5 block text-xs text-text-muted">{$tr("guides.featuredDesc")}</span>
      </span>
      <span class="shrink-0 text-xs tabular-nums text-text-muted">{featured.duration}</span>
    </button>
  </section>

  <!-- Chapter guides -->
  <section>
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
      {$tr("guides.chaptersLabel")}
    </h2>
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {#each chapters as video (video.file)}
        <button
          type="button"
          onclick={() => pick(video)}
          data-guides-item={video.file}
          class="flex items-center gap-3 rounded-lg border p-3 text-left transition-[border-color,background] duration-150 hover:border-border-strong hover:bg-bg-raised {selected.file ===
          video.file
            ? 'border-accent bg-accent/5'
            : 'border-border bg-surface-card'}"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-hover text-text-secondary"
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
            {$tr(video.titleKey)}
          </span>
          <span class="shrink-0 text-xs tabular-nums text-text-muted">{video.duration}</span>
        </button>
      {/each}
    </div>
  </section>
</div>
