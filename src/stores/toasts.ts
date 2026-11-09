import { writable } from "svelte/store";

type ToastLevel = "info" | "success" | "warning" | "error";

/** An optional inline button (e.g. "Undo") rendered inside the toast. */
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

interface ToastInput {
  level?: ToastLevel;
  title?: string;
  message: string;
  durationMs?: number;
  sticky?: boolean;
  action?: ToastAction;
}

interface Toast {
  id: number;
  level: ToastLevel;
  title: string;
  message: string;
  durationMs: number;
  sticky: boolean;
  createdAt: number;
  action?: ToastAction;
}

const DEFAULT_TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 6;

let nextToastId = 1;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = writable<Toast[]>([]);

export function addToast(input: ToastInput): number {
  const id = nextToastId++;
  const toast: Toast = {
    id,
    level: input.level || "info",
    title: input.title || "",
    message: input.message,
    durationMs: Math.max(500, input.durationMs ?? DEFAULT_TOAST_DURATION_MS),
    sticky: Boolean(input.sticky),
    createdAt: Date.now(),
    // Spread only when present: exactOptionalPropertyTypes rejects action: undefined.
    ...(input.action ? { action: input.action } : {}),
  };

  toasts.update((current) => [toast, ...current].slice(0, MAX_TOASTS));

  if (!toast.sticky) {
    const timer = setTimeout(() => {
      removeToast(id);
    }, toast.durationMs);
    toastTimers.set(id, timer);
  }

  return id;
}

export function removeToast(id: number): void {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
  toasts.update((current) => current.filter((toast) => toast.id !== id));
}
