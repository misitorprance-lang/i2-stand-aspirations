// Background music loop — already pre-pixelated to 8kHz / 8-bit / mono WAV.
// Plays only after first user gesture; respects sound-toggle.

import { isSoundEnabled } from "./sound";

let audio: HTMLAudioElement | null = null;
let started = false;

function ensure(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio("/music/bg-pixel.wav");
    audio.loop = true;
    audio.volume = 0.22;
    audio.preload = "auto";
  }
  return audio;
}

export function startMusic() {
  const a = ensure();
  if (!a || started) return;
  if (!isSoundEnabled()) return;
  a.play().then(() => { started = true; }).catch(() => { /* user must gesture again */ });
}

export function applyMusicSetting(enabled: boolean) {
  const a = ensure();
  if (!a) return;
  if (enabled) {
    a.play().then(() => { started = true; }).catch(() => {});
  } else {
    a.pause();
  }
}
