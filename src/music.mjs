// Music sync: Web Audio play/pause of a short built-in loop or a user file.
 // AnalyserNode energy pulses stroke brightness and set_speed; optional bass
 // band drives the shape slider via a Gleam callback.

import { setSpeed, setStrokeBrightness } from "./canvas.mjs";

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let gainNode = null;
let buffer = null;
let playing = false;
let sensitivity = 0.55;
let bassLink = false;
let baseSpeed = 1;
let raf = 0;
let lastBeat = 0;
let onBass = null;
let onPulse = null;
let usingBuiltin = true;

const BUILTIN_BPM = 96;

export function setSensitivity(s) {
  sensitivity = clamp(Number(s) || 0.55, 0.05, 1.5);
}

export function setBassLink(on) {
  bassLink = !!on;
}

export function setBaseSpeed(rate) {
  baseSpeed = Number(rate) || 0;
}

export function setCallbacks(bassCb, pulseCb) {
  onBass = bassCb;
  onPulse = pulseCb;
}

export function isPlaying() {
  return playing;
}

function ensureCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.7;
    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
  return audioCtx;
}

/** Procedural 2-bar kick/hat loop as an AudioBuffer (no external asset). */
async function ensureBuiltinBuffer() {
  const ctx = ensureCtx();
  if (buffer && usingBuiltin) return buffer;
  const bpm = BUILTIN_BPM;
  const beats = 8;
  const duration = (60 / bpm) * beats;
  const rate = ctx.sampleRate;
  const n = Math.floor(duration * rate);
  const data = ctx.createBuffer(1, n, rate);
  const ch = data.getChannelData(0);
  const beatDur = 60 / bpm;

  for (let b = 0; b < beats; b++) {
    const t0 = Math.floor(b * beatDur * rate);
    // Kick on every beat
    for (let i = 0; i < rate * 0.18; i++) {
      const t = i / rate;
      const env = Math.exp(-t * 18);
      const freq = 120 * Math.exp(-t * 10);
      ch[t0 + i] += env * Math.sin(2 * Math.PI * freq * t) * 0.9;
    }
    // Hat on off-beats
    if (b % 2 === 1) {
      for (let i = 0; i < rate * 0.05; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 60);
        ch[t0 + i] += env * (Math.random() * 2 - 1) * 0.25;
      }
    }
    // Soft mid tone every 4 beats
    if (b % 4 === 0) {
      for (let i = 0; i < rate * 0.35; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 4) * 0.35;
        ch[t0 + i] += env * Math.sin(2 * Math.PI * 220 * t);
      }
    }
  }
  // Soft clip
  for (let i = 0; i < n; i++) {
    ch[i] = Math.tanh(ch[i]);
  }
  buffer = data;
  usingBuiltin = true;
  return buffer;
}

export async function loadUserFile(file) {
  const ctx = ensureCtx();
  const arr = await file.arrayBuffer();
  buffer = await ctx.decodeAudioData(arr.slice(0));
  usingBuiltin = false;
  if (playing) {
    stopSource();
    startSource();
  }
}

export async function play() {
  const ctx = ensureCtx();
  if (ctx.state === "suspended") await ctx.resume();
  if (!buffer) await ensureBuiltinBuffer();
  stopSource();
  startSource();
  playing = true;
  loopAnalyse();
}

export function pause() {
  stopSource();
  playing = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  setStrokeBrightness(1);
  setSpeed(baseSpeed);
}

export async function toggle() {
  if (playing) pause();
  else await play();
  return playing;
}

export async function useBuiltin() {
  usingBuiltin = true;
  buffer = null;
  await ensureBuiltinBuffer();
  if (playing) {
    stopSource();
    startSource();
  }
}

function startSource() {
  const ctx = ensureCtx();
  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.loop = true;
  sourceNode.connect(gainNode);
  sourceNode.start(0);
}

function stopSource() {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch (_) {
      /* already stopped */
    }
    try {
      sourceNode.disconnect();
    } catch (_) {
      /* ignore */
    }
    sourceNode = null;
  }
}

function loopAnalyse() {
  if (!playing || !analyser) return;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);

  // Overall energy (beat proxy) and low-band bass.
  let sum = 0;
  let bass = 0;
  const bassBins = Math.max(4, Math.floor(bins.length * 0.12));
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i];
    if (i < bassBins) bass += bins[i];
  }
  const energy = sum / (bins.length * 255);
  const bassLevel = bass / (bassBins * 255);

  const thresh = 0.22 + (1 - sensitivity) * 0.35;
  const now = performance.now();
  const bright = 1 + energy * sensitivity * 2.2;
  setStrokeBrightness(bright);

  if (energy > thresh && now - lastBeat > 140) {
    lastBeat = now;
    const pulse = baseSpeed * (1 + sensitivity * 0.85 * energy);
    setSpeed(pulse);
    if (onPulse) onPulse(pulse);
    // Ease back toward the user-chosen base speed.
    window.setTimeout(() => {
      if (playing) setSpeed(baseSpeed);
    }, 90);
  }

  if (bassLink && onBass) {
    const shape = Math.round(clamp(bassLevel * sensitivity * 120, 0, 100));
    onBass(shape);
  }

  raf = requestAnimationFrame(loopAnalyse);
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
