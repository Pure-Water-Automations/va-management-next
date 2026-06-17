/**
 * Tiny synthesized "cute robot" sound effects for Purii (Web Audio — no files).
 * All calls are no-ops if muted or if AudioContext is unavailable. Must be
 * triggered from a user gesture (they are — clicks/sends) per browser policy.
 */
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(freq: number, start: number, dur = 0.07, type: OscillatorType = "square", gain = 0.06) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Cute robot "talking" — a short burst of bright blips at wobbly pitch. */
export function sndTalk() {
  if (muted) return;
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const f = 620 + Math.random() * 380;
    blip(f, i * 0.06, 0.055, "square", 0.045);
  }
}
export function sndOpen() {
  if (muted) return;
  blip(523, 0, 0.08, "triangle", 0.07);
  blip(784, 0.08, 0.1, "triangle", 0.07);
}
export function sndPowerUp() {
  if (muted) return;
  [330, 440, 587, 740, 988].forEach((f, i) => blip(f, i * 0.06, 0.09, "sawtooth", 0.05));
}
export function sndSuccess() {
  if (muted) return;
  [659, 784, 1047].forEach((f, i) => blip(f, i * 0.07, 0.11, "triangle", 0.07));
}
export function sndError() {
  if (muted) return;
  blip(220, 0, 0.16, "sawtooth", 0.06);
  blip(165, 0.12, 0.18, "sawtooth", 0.06);
}
