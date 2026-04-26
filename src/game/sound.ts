// Lightweight WebAudio SFX synthesizer. No external assets.
// All sounds are short procedural blips/noises tuned per move.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() { ensure(); }
export function setSoundEnabled(v: boolean) { enabled = v; }
export function isSoundEnabled() { return enabled; }

function envGain(g: GainNode, t: number, attack: number, decay: number, peak = 1) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", peak = 0.5, slideTo?: number) {
  const c = ensure(); if (!c || !enabled || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  envGain(g, t, 0.005, dur, peak);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, peak = 0.3, filterFreq = 1200, filterType: BiquadFilterType = "lowpass") {
  const c = ensure(); if (!c || !enabled || !master) return;
  const t = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  envGain(g, t, 0.005, dur, peak);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// ---- per-move SFX ----
export const SFX = {
  punch:        () => { tone(220, 0.08, "square", 0.35, 90); noise(0.06, 0.15, 800); },
  starFinger:   () => { tone(880, 0.18, "triangle", 0.4, 220); tone(1320, 0.12, "sine", 0.25, 660); },
  rangedSmash:  () => { tone(180, 0.22, "sawtooth", 0.45, 60); noise(0.18, 0.2, 600); },
  oraTick:      () => { tone(420 + Math.random() * 120, 0.05, "square", 0.25, 200); },
  launch:       () => { tone(120, 0.3, "sawtooth", 0.5, 40); noise(0.2, 0.3, 400); },
  electricShot: () => { tone(1200, 0.15, "square", 0.3, 600); tone(1800, 0.1, "sawtooth", 0.2, 900); },
  discharge:    () => { tone(600, 0.25, "sawtooth", 0.5, 120); noise(0.25, 0.3, 2400, "highpass"); },
  bomber:       () => { noise(0.35, 0.45, 200); tone(80, 0.4, "sawtooth", 0.45, 30); },
  tesla:        () => { tone(2000, 0.06, "square", 0.18, 1500); },
  freezeTouch:  () => { tone(1600, 0.18, "sine", 0.3, 2400); tone(800, 0.15, "triangle", 0.2, 1200); },
  explosiveText:() => { tone(140, 0.5, "sawtooth", 0.5, 40); noise(0.3, 0.35, 300); },
  burningText:  () => { noise(0.18, 0.2, 800, "lowpass"); tone(180, 0.18, "sawtooth", 0.25, 90); },
  threeFreeze:  () => { tone(60, 0.35, "sine", 0.5, 30); tone(900, 0.15, "triangle", 0.35, 200); noise(0.25, 0.25, 200); },
  shit:         () => { tone(40, 0.6, "sawtooth", 0.6, 20); noise(0.55, 0.5, 150); tone(120, 0.5, "square", 0.3, 30); },
  pickupArrow:  () => { tone(660, 0.08, "triangle", 0.3, 880); tone(990, 0.1, "triangle", 0.3, 1320); },
  pickupDisc:   () => { tone(440, 0.08, "sine", 0.3, 660); tone(330, 0.1, "sine", 0.3, 220); },
  rollStand:    () => { tone(500, 0.06, "square", 0.3, 700); tone(700, 0.06, "square", 0.3, 1000); tone(900, 0.08, "square", 0.3, 1400); },
  hurt:         () => { tone(300, 0.12, "sawtooth", 0.35, 120); noise(0.08, 0.2, 600); },
  footstep:     () => { noise(0.04, 0.06, 350, "lowpass"); },
  standSummon:  () => { tone(220, 0.25, "triangle", 0.3, 660); tone(440, 0.2, "sine", 0.2, 880); },
  standDismiss: () => { tone(660, 0.15, "triangle", 0.25, 220); tone(330, 0.18, "sine", 0.18, 110); },
  puppet:       () => { tone(260, 0.12, "triangle", 0.25, 520); tone(130, 0.18, "sawtooth", 0.18, 90); },
  spear:        () => { tone(760, 0.12, "sawtooth", 0.28, 320); noise(0.07, 0.12, 1800, "highpass"); },
  spin:         () => { tone(440, 0.22, "triangle", 0.28, 880); noise(0.16, 0.12, 1200); },
  rage:         () => { tone(90, 0.45, "sawtooth", 0.45, 45); tone(180, 0.25, "square", 0.25, 260); },
  eagle:        () => { tone(1400, 0.1, "triangle", 0.3, 2200); tone(900, 0.08, "triangle", 0.2, 1500); },
  chain:        () => { tone(1800, 0.05, "square", 0.2, 2400); },
  frog:         () => { tone(180, 0.06, "square", 0.25, 320); tone(140, 0.1, "triangle", 0.2, 90); },
  hologram:     () => { tone(520, 0.3, "sine", 0.3, 880); tone(330, 0.35, "triangle", 0.2, 220); },
  tree:         () => { tone(110, 0.45, "sine", 0.4, 220); tone(330, 0.3, "triangle", 0.25, 660); },
  bleed:        () => { noise(0.08, 0.12, 500, "lowpass"); },
  electrocute:  () => { tone(2400, 0.04, "square", 0.18, 3200); },
  toggleOn:     () => { tone(440, 0.08, "triangle", 0.25, 880); tone(660, 0.08, "triangle", 0.25, 1320); },
  toggleOff:    () => { tone(660, 0.08, "triangle", 0.25, 440); tone(330, 0.1, "triangle", 0.2, 165); },
};

export type SfxKey = keyof typeof SFX;

export function play(key: SfxKey) {
  try { SFX[key](); } catch { /* ignore */ }
}
