/**
 * use:countUp — animate a headline number from its previous value to the next,
 * writing the formatted result into the node's text. Built for KPI-style figures
 * (inventory count, platinum/ducat totals, stats headlines) where the element's
 * text IS the number, so the action owns `textContent`.
 *
 *   <span use:countUp={total}>…</span>
 *   <span use:countUp={{ value: plat, format: (n) => n.toLocaleString() }}></span>
 *
 * First mount counts up from 0; later changes tween from the old value. Honours
 * prefers-reduced-motion (and is a no-op jump when the delta is tiny), and pins
 * tabular figures so the width never jitters mid-count.
 */
type Formatter = (value: number) => string;
type CountUpOptions =
  | number
  | { value: number; format?: Formatter; duration?: number };

const DEFAULT_DURATION = 600;
const defaultFormat: Formatter = (n) => Math.round(n).toLocaleString();

function normalise(options: CountUpOptions): {
  value: number;
  format: Formatter;
  duration: number;
} {
  if (typeof options === "number") {
    return { value: options, format: defaultFormat, duration: DEFAULT_DURATION };
  }
  return {
    value: options.value,
    format: options.format ?? defaultFormat,
    duration: options.duration ?? DEFAULT_DURATION,
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// Ease-out cubic: fast start, gentle settle — reads as the number "landing".
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export function countUp(node: HTMLElement, options: CountUpOptions) {
  let { value, format, duration } = normalise(options);
  let current = value;
  let frame: number | undefined;

  node.style.fontVariantNumeric = "tabular-nums";

  function paint(n: number): void {
    node.textContent = format(n);
  }

  function run(from: number, to: number): void {
    if (frame) cancelAnimationFrame(frame);
    if (prefersReducedMotion() || Math.abs(to - from) < 1 || duration <= 0) {
      current = to;
      paint(to);
      return;
    }
    // rAF start time comes from the callback's own timestamp, so Date.now() is
    // never needed (and the first tick seeds the baseline).
    let start: number | undefined;
    const step = (now: number): void => {
      if (start === undefined) start = now;
      const t = Math.min(1, (now - start) / duration);
      const n = from + (to - from) * easeOut(t);
      paint(n);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        current = to;
        paint(to);
        frame = undefined;
      }
    };
    frame = requestAnimationFrame(step);
  }

  // Count up from zero the first time the figure appears.
  run(0, value);

  return {
    update(next: CountUpOptions): void {
      const prev = current;
      ({ value, format, duration } = normalise(next));
      if (value !== prev) run(prev, value);
      else paint(value);
    },
    destroy(): void {
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
