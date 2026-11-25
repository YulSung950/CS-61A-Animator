// Music sync: Web Audio play/pause of a short built-in loop or a user file.
// AnalyserNode energy pulses stroke brightness and set_speed; optional bass
// band drives the shape slider via a Gleam callback.
//
// Silence root cause (post PR #7): Play ran inside a Lustre effect *after* the
// click gesture ended, so AudioContext stayed suspended / never unlocked under
// autoplay policy. Fix: capture-phase unlock on the Play button, resume before
// start, and always emit an OscillatorNode beep so the user hears sound even if
// the buffer loop is still building.

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
let unlockArmed = false;
let gestureBound = false;

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

/**
 * Capture-phase click on the Music Play/Pause button so AudioContext is
 * created/resumed inside the real user gesture (Lustre effects run too late).
 */
export function bindPlayGesture(testId = "music-toggle") {
  if (gestureBound || typeof document === "undefined") return;
  gestureBound = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      const el = event.target;
      if (!el || typeof el.closest !== "function") return;
      if (!el.closest(`[data-test-id="${testId}"]`)) return;
      unlockSync();
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const el = event.target;
      if (!el || typeof el.closest !== "function") return;
      if (!el.closest(`[data-test-id="${testId}"]`)) return;
      // Second chance on click (some environments deliver click without prior
      // pointerdown to the same target). Still inside the gesture.
      unlockSync();
    },
    true,
  );
}

/** Create the Web Audio graph on first use (should be during a user gesture). */
function ensureCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.error("Web Audio API is not available in this browser.");
      return null;
    }
    audioCtx = new Ctx();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    gainNode = audioCtx.createGain();
    // Comfortable level; not muted. Autoplay only blocks until resume().
    gainNode.gain.value = 0.9;
    // Single audible path: gain → analyser → destination (analyser does not mute).
    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    armGestureUnlock();
  }
  return audioCtx;
}

/** Synchronous unlock for use inside pointer/click handlers. */
export function unlockSync() {
  const ctx = ensureCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    // Do not await — starting resume() during the gesture is what matters.
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Resume a suspended AudioContext; safe to call from async play(). */
function armGestureUnlock() {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

async function resumeCtx() {
  const ctx = ensureCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (err) {
      console.warn("AudioContext resume failed:", err);
    }
  }
  return ctx;
}

/**
 * Immediate audible proof via OscillatorNode (no buffer / file / CORS).
 * Runs fully synchronously so it still works right after a gesture unlock.
 */
function playBeep(freq = 660, seconds = 0.16, peak = 0.55) {
  const ctx = ensureCtx();
  if (!ctx || !gainNode) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, now);
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(env);
  env.connect(gainNode);
  try {
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  } catch (err) {
    console.warn("Oscillator beep failed:", err);
  }
}

/**
 * Procedural 2-bar kick/hat loop as an AudioBuffer (no external asset).
 * Only builds once we have a live AudioContext (sampleRate from the device).
 */
function buildBuiltinBuffer(ctx) {
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
      ch[t0 + i] += env * Math.sin(2 * Math.PI * freq * t) * 0.95;
    }
    // Hat on off-beats
    if (b % 2 === 1) {
      for (let i = 0; i < rate * 0.05; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 60);
        ch[t0 + i] += env * (Math.random() * 2 - 1) * 0.35;
      }
    }
    // Soft mid tone every 4 beats
    if (b % 4 === 0) {
      for (let i = 0; i < rate * 0.35; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 4) * 0.45;
        ch[t0 + i] += env * Math.sin(2 * Math.PI * 220 * t);
      }
    }
  }
  // Soft clip
  for (let i = 0; i < n; i++) {
    ch[i] = Math.tanh(ch[i]);
  }
  return data;
}

async function ensureBuiltinBuffer() {
  const ctx = ensureCtx();
  if (!ctx) return null;
  if (buffer && usingBuiltin) return buffer;
  buffer = buildBuiltinBuffer(ctx);
  usingBuiltin = true;
  return buffer;
}

export async function loadUserFile(file) {
  const ctx = await resumeCtx();
  if (!ctx) return;
  // File picker ArrayBuffers have no CORS; decode into a BufferSource loop.
  // (Avoid MediaElementSource — remote/file elements often stay silent with CORS.)
  const arr = await file.arrayBuffer();
  buffer = await ctx.decodeAudioData(arr.slice(0));
  usingBuiltin = false;
  if (playing) {
    stopSource();
    startSource();
  }
}

export async function play() {
  // Prefer any gesture unlock already done; resume again if still suspended.
  unlockSync();
  const ctx = await resumeCtx();
  if (!ctx) return false;

  // Always beep first so Play is audibly confirmed even if the loop fails.
  playBeep(720, 0.14, 0.6);

  if (!buffer) {
    try {
      await ensureBuiltinBuffer();
    } catch (err) {
      console.warn("Builtin buffer build failed:", err);
    }
  }

  // Resume again right before start — some browsers re-suspend between awaits.
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (_) {
      /* ignore */
    }
  }

  stopSource();
  if (buffer) {
    startSource();
  } else {
    // Reliable fallback: keep a soft pulse tone looping via oscillators.
    startFallbackToneLoop();
  }
  playing = true;
  loopAnalyse();
  return true;
}

export function pause() {
  stopSource();
  stopFallbackTone();
  playing = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  setStrokeBrightness(1);
  setSpeed(baseSpeed);
}

export async function toggle() {
  if (playing) {
    pause();
    return false;
  }
  return await play();
}

/** Prefetch the built-in loop without forcing playback. Safe before a gesture. */
export async function useBuiltin() {
  usingBuiltin = true;
  buffer = null;
  // Defer AudioContext creation until Play — only mark that we want the builtin.
  // If a context already exists (user already pressed Play once), rebuild now.
  if (audioCtx) {
    await ensureBuiltinBuffer();
    if (playing) {
      stopSource();
      startSource();
    }
  }
}

function startSource() {
  const ctx = ensureCtx();
  if (!ctx || !buffer || !gainNode) return;
  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.loop = true;
  sourceNode.connect(gainNode);
  try {
    sourceNode.start(0);
  } catch (err) {
    console.warn("BufferSource start failed:", err);
    startFallbackToneLoop();
  }
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

// ── Oscillator fallback loop (when buffer missing / start failed) ───────────
let fallbackOsc = null;
let fallbackGain = null;
let fallbackTimer = 0;

function startFallbackToneLoop() {
  stopFallbackTone();
  const ctx = ensureCtx();
  if (!ctx || !gainNode) return;

  const pulse = () => {
    if (!playing) return;
    playBeep(220, 0.08, 0.45);
    playBeep(330, 0.05, 0.25);
    fallbackTimer = window.setTimeout(pulse, 310);
  };
  pulse();
}

function stopFallbackTone() {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  }
  if (fallbackOsc) {
    try {
      fallbackOsc.stop();
    } catch (_) {
      /* ignore */
    }
    try {
      fallbackOsc.disconnect();
    } catch (_) {
      /* ignore */
    }
    fallbackOsc = null;
  }
  if (fallbackGain) {
    try {
      fallbackGain.disconnect();
    } catch (_) {
      /* ignore */
    }
    fallbackGain = null;
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
