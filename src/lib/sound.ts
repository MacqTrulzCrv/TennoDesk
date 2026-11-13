import { get } from "svelte/store";

import { soundFeedback } from "../stores/preferences.js";

// One shared context, created lazily on the first real play so we never open an
// AudioContext the user never hears.
let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext ??= new Ctor();
    return audioContext;
  } catch {
    return null;
  }
}

/** A short, soft confirmation "tick". Synthesised (no asset) and a no-op when the
 *  preference is off or WebAudio is unavailable, so callers can fire it freely. */
export function playActionTick(): void {
  if (!get(soundFeedback)) return;
  const audio = context();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}
