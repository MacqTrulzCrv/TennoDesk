<script lang="ts">
  import { afterUpdate, onMount } from "svelte";

  export let options: Array<{ key: string; label: string }> = [];
  export let activeKey = "";
  export let onSelect: (key: string) => void;

  let nav: HTMLDivElement;
  let left = 0;
  let width = 0;
  let ready = false;

  // The underline follows the active tab; only reassign on real change so
  // afterUpdate cannot loop on identical measurements.
  function measure(): void {
    const el = nav?.querySelector<HTMLElement>("[data-active]");
    if (!el) {
      ready = false;
      return;
    }
    if (el.offsetLeft !== left || el.offsetWidth !== width || !ready) {
      left = el.offsetLeft;
      width = el.offsetWidth;
      ready = true;
    }
  }

  onMount(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  afterUpdate(measure);
</script>

<div class="relative flex flex-wrap" bind:this={nav}>
  {#each options as option (option.key)}
    <button
      class="flex items-center whitespace-nowrap border-0 bg-transparent px-4 py-2 font-display text-base text-text-secondary transition-colors duration-150 hover:text-text-body data-[active]:text-text-heading"
      data-active={activeKey === option.key || undefined}
      data-tour-tab={option.key}
      on:click={() => onSelect(option.key)}
    >
      {option.label}
    </button>
  {/each}
  <span
    class="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-[color:var(--view-accent)] transition-[transform,width,opacity] duration-300 ease-out"
    style="width: {width}px; transform: translateX({left}px); opacity: {ready ? 1 : 0}"
  ></span>
</div>
