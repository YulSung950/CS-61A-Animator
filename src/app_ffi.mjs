/** One-shot window Escape listener for dismissing the canvas error overlay. */
export function listenEscape(callback) {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") callback();
  });
}

// Side-effect import: registers duel hooks on the canvas frame loop.
import * as duel from "./duel.mjs";
import * as music from "./music.mjs";

export function setDuelEnabled(on) {
  duel.setEnabled(on);
}

export function setDuelMode(mode) {
  duel.setMode(mode);
}

export function restartDuel() {
  duel.restartRound();
}

export function listenDuelStatus(callback) {
  duel.onStatus((label) => callback(label));
}

export function setMusicSensitivity(s) {
  music.setSensitivity(s);
}

export function setMusicBassLink(on) {
  music.setBassLink(on);
}

export function setMusicBaseSpeed(rate) {
  music.setBaseSpeed(rate);
}

export function wireMusicCallbacks(onBass, onPulse) {
  music.setCallbacks(
    (shape) => onBass(shape),
    (pulse) => onPulse(pulse),
  );
}

export function toggleMusic() {
  // Fire-and-forget: AudioContext resume is async inside music.toggle.
  music.toggle();
}

export function pauseMusic() {
  music.pause();
}

export function useBuiltinMusic() {
  music.useBuiltin();
}

/** Document-level change listener so Lustre re-renders keep the file picker working. */
export function bindMusicFileInput(id) {
  if (window._musicFileBound) return;
  window._musicFileBound = true;
  document.addEventListener("change", async (event) => {
    const el = event.target;
    if (!el || el.id !== id) return;
    const file = el.files && el.files[0];
    if (file) await music.loadUserFile(file);
  });
}
