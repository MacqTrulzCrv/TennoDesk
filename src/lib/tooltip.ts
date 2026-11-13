/**
 * use:tooltip — a delayed, token-styled tooltip that replaces the native title
 * on icon-only controls. A single shared element is reused for every target.
 *
 *   <button use:tooltip={"Open externally"} aria-label="Open externally">
 *   <button use:tooltip={{ text, placement: "bottom" }}>
 */
type TooltipOptions = string | { text: string; placement?: "top" | "bottom" };
type Normalised = { text: string; placement: "top" | "bottom" };

let tip: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function normalise(options: TooltipOptions): Normalised {
  return typeof options === "string"
    ? { text: options, placement: "top" }
    : { text: options.text, placement: options.placement ?? "top" };
}

function ensureTip(): HTMLDivElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "app-tooltip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  return tip;
}

function show(node: HTMLElement, { text, placement }: Normalised): void {
  if (!text) return;
  const el = ensureTip();
  el.textContent = text;
  el.dataset.placement = placement;
  el.classList.add("app-tooltip--visible");
  // Measured after the text is set so width reflects the real content.
  const anchor = node.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const top = placement === "top" ? anchor.top - box.height - 8 : anchor.bottom + 8;
  const rawLeft = anchor.left + anchor.width / 2 - box.width / 2;
  const left = Math.max(6, Math.min(rawLeft, window.innerWidth - box.width - 6));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

function hide(): void {
  tip?.classList.remove("app-tooltip--visible");
}

export function tooltip(node: HTMLElement, options: TooltipOptions) {
  let opts = normalise(options);
  let showTimer: ReturnType<typeof setTimeout> | undefined;

  function open(): void {
    clearTimeout(hideTimer);
    showTimer = setTimeout(() => show(node, opts), 350);
  }
  function close(): void {
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, 60);
  }

  node.addEventListener("mouseenter", open);
  node.addEventListener("mouseleave", close);
  node.addEventListener("focus", open);
  node.addEventListener("blur", close);

  return {
    update(next: TooltipOptions): void {
      opts = normalise(next);
    },
    destroy(): void {
      clearTimeout(showTimer);
      node.removeEventListener("mouseenter", open);
      node.removeEventListener("mouseleave", close);
      node.removeEventListener("focus", open);
      node.removeEventListener("blur", close);
      close();
    },
  };
}

/**
 * globalTooltips() — install once (App.svelte onMount) so EVERY native `title`
 * in the app renders as the styled tooltip instead of the browser default.
 * Event delegation on document: no per-element wiring, so all existing
 * `title="…"` sites are covered without edits.
 *
 * While a target is hovered/focused its `title` is stolen (moved out of the
 * attribute) so the native tooltip never fires; it is restored the moment the
 * pointer/focus leaves, keeping the DOM — and any reactive framework that owns
 * the attribute — untouched between interactions.
 */
let activeNode: HTMLElement | null = null;
let stolenTitle = "";
let globalShowTimer: ReturnType<typeof setTimeout> | undefined;

function restoreActive(): void {
  if (activeNode) {
    activeNode.setAttribute("title", stolenTitle);
    activeNode = null;
    stolenTitle = "";
  }
}

function leaveGlobal(): void {
  clearTimeout(globalShowTimer);
  restoreActive();
  hideTimer = setTimeout(hide, 60);
}

function enterGlobal(target: EventTarget | null): void {
  const node = target instanceof Element ? (target.closest("[title]") as HTMLElement | null) : null;
  // Already showing this one, or nothing with a title under the pointer.
  if (node === activeNode) return;
  // Moving to a different (or no) target — tear down the previous one first.
  clearTimeout(globalShowTimer);
  restoreActive();
  if (!node) {
    hideTimer = setTimeout(hide, 60);
    return;
  }
  const text = node.getAttribute("title") ?? "";
  if (!text.trim()) return;
  // Steal the title so the browser's own tooltip stays silent.
  activeNode = node;
  stolenTitle = text;
  node.removeAttribute("title");
  clearTimeout(hideTimer);
  // Below-placement when there is little room above (e.g. top toolbar).
  const placement = node.getBoundingClientRect().top < 56 ? "bottom" : "top";
  globalShowTimer = setTimeout(() => show(node, { text, placement }), 350);
}

export function globalTooltips(): () => void {
  const onOver = (e: MouseEvent) => enterGlobal(e.target);
  const onOut = (e: MouseEvent) => {
    // Ignore moves that stay within the active node's subtree.
    const to = e.relatedTarget;
    if (activeNode && to instanceof Node && activeNode.contains(to)) return;
    leaveGlobal();
  };
  const onFocusIn = (e: FocusEvent) => enterGlobal(e.target);
  const onFocusOut = () => leaveGlobal();
  // Any click/scroll/keydown should dismiss immediately — the content moved.
  const onDismiss = () => leaveGlobal();

  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("mouseout", onOut, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("click", onDismiss, true);
  window.addEventListener("scroll", onDismiss, true);

  return () => {
    clearTimeout(globalShowTimer);
    restoreActive();
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout", onOut, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("click", onDismiss, true);
    window.removeEventListener("scroll", onDismiss, true);
  };
}
