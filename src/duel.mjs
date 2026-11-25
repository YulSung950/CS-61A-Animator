// Mirror duel: two riders race toward each other on the current drawing's
 // path (player forward from the start, opponent backward from the end).
 // Collision sparks and ends the round. Default opponent is a simple AI;
 // hot-seat mode lets a second keyboard player control the mirror rider.

import { setDuelHooks } from "./canvas.mjs";

const COLLISION_EPS = 0.028;
const PLAYER_ACCEL = 1.6;
const PLAYER_DRAG = 2.2;
const PLAYER_MAX = 0.55;
const AI_BASE = 0.18;
const AI_REACT = 0.12;
const HOTSEAT_ACCEL = 1.6;
const SPARK_LIFE = 0.9;

let enabled = false;
let mode = "ai"; // "ai" | "hotseat"
let track = null; // { pts: Float64Array [x,y,...], cum: Float64Array lengths, total }
let playerS = 0;
let opponentS = 1;
let playerV = 0;
let opponentV = 0;
let status = "idle"; // idle | playing | crashed | won
let sparks = [];
let keys = Object.create(null);
let statusCallback = null;
let listening = false;

export function setEnabled(on) {
  enabled = !!on;
  if (enabled) {
    ensureKeys();
    restartRound();
  } else {
    status = "idle";
    sparks = [];
    notifyStatus();
  }
}

export function setMode(m) {
  mode = m === "hotseat" ? "hotseat" : "ai";
  if (enabled) restartRound();
}

export function isEnabled() {
  return enabled;
}

export function onStatus(cb) {
  statusCallback = cb;
}

export function restartRound() {
  if (!track || track.total <= 0) {
    status = "idle";
    notifyStatus();
    return;
  }
  playerS = 0.02;
  opponentS = 0.98;
  playerV = 0;
  opponentV = 0;
  sparks = [];
  status = "playing";
  notifyStatus();
}

function notifyStatus() {
  if (statusCallback) statusCallback(statusLabel());
}

function statusLabel() {
  if (!enabled) return "";
  if (!track) return "Draw a path first";
  if (status === "crashed") return "CRASH — Space to rematch";
  if (status === "won") return "Clear! Space to rematch";
  if (mode === "hotseat") return "Hot-seat · A/D vs J/L · Space rematch";
  return "Mirror duel · A/D or ←/→ · Space rematch";
}

function ensureKeys() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

function onKeyDown(e) {
  if (!enabled) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
    return;
  }
  keys[e.key] = true;
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    if (status === "crashed" || status === "won" || status === "playing") {
      restartRound();
    }
  }
}

function onKeyUp(e) {
  keys[e.key] = false;
}

function keyDown(name) {
  return !!keys[name];
}

/** Build an arc-length track from the canvas path list (after setDrawing). */
export function onDrawing(paths) {
  const flat = [];
  for (const p of paths) {
    const pts = p.pts;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      const n = flat.length;
      if (n >= 2) {
        const dx = x - flat[n - 2];
        const dy = y - flat[n - 1];
        // Skip duplicate vertices when segments already share an endpoint.
        if (dx * dx + dy * dy < 1e-6) continue;
      }
      flat.push(x, y);
    }
  }
  if (flat.length < 4) {
    track = null;
    if (enabled) {
      status = "idle";
      notifyStatus();
    }
    return;
  }
  const pts = new Float64Array(flat);
  const segCount = pts.length / 2 - 1;
  const cum = new Float64Array(segCount + 1);
  let total = 0;
  for (let i = 0; i < segCount; i++) {
    const ax = pts[2 * i];
    const ay = pts[2 * i + 1];
    const bx = pts[2 * i + 2];
    const by = pts[2 * i + 3];
    total += Math.hypot(bx - ax, by - ay);
    cum[i + 1] = total;
  }
  track = { pts, cum, total };
  if (enabled) restartRound();
  else notifyStatus();
}

export function tick(dt) {
  if (!enabled || !track || status !== "playing") {
    ageSparks(dt);
    return;
  }

  // Player: A/D or arrows accelerate along the path (forward = increasing s).
  let input = 0;
  if (keyDown("ArrowRight") || keyDown("d") || keyDown("D")) input += 1;
  if (keyDown("ArrowLeft") || keyDown("a") || keyDown("A")) input -= 1;
  playerV += input * PLAYER_ACCEL * dt;
  playerV -= playerV * PLAYER_DRAG * dt;
  playerV = clamp(playerV, -PLAYER_MAX, PLAYER_MAX);
  playerS = clamp(playerS + playerV * dt, 0, 1);

  if (mode === "hotseat") {
    let oppIn = 0;
    // Mirror rider faces backward: J pulls toward the start (decreasing s), L away.
    if (keyDown("j") || keyDown("J")) oppIn -= 1;
    if (keyDown("l") || keyDown("L")) oppIn += 1;
    opponentV += oppIn * HOTSEAT_ACCEL * dt;
    opponentV -= opponentV * PLAYER_DRAG * dt;
    opponentV = clamp(opponentV, -PLAYER_MAX, PLAYER_MAX);
    opponentS = clamp(opponentS + opponentV * dt, 0, 1);
  } else {
    // AI rides backward toward the player, speeding up as the gap closes.
    const gap = opponentS - playerS;
    const speed = AI_BASE + AI_REACT * Math.max(0, 1 - gap);
    opponentS = clamp(opponentS - speed * dt, 0, 1);
  }

  if (opponentS - playerS <= COLLISION_EPS) {
    status = "crashed";
    spawnSparks(midpoint());
    notifyStatus();
  } else if (playerS >= 0.97 && opponentS > playerS + COLLISION_EPS) {
    // Reached the far end without colliding — rare, but counts as a clear.
    status = "won";
    notifyStatus();
  }

  ageSparks(dt);
}

function midpoint() {
  const s = (playerS + opponentS) / 2;
  return sample(s);
}

function spawnSparks(origin) {
  const [x, y] = origin;
  for (let i = 0; i < 28; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 220;
    sparks.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: SPARK_LIFE * (0.5 + Math.random() * 0.5),
      max: SPARK_LIFE,
    });
  }
}

function ageSparks(dt) {
  for (const s of sparks) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.96;
    s.vy *= 0.96;
  }
  sparks = sparks.filter((s) => s.life > 0);
}

function sample(s) {
  if (!track || track.total <= 0) return [0, 0];
  const target = clamp(s, 0, 1) * track.total;
  const cum = track.cum;
  const pts = track.pts;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < target) i++;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen <= 1e-9 ? 0 : (target - cum[i]) / segLen;
  const ax = pts[2 * i];
  const ay = pts[2 * i + 1];
  const bx = pts[2 * i + 2];
  const by = pts[2 * i + 3];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function tangent(s) {
  const a = sample(Math.max(0, s - 0.01));
  const b = sample(Math.min(1, s + 0.01));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

export function draw(ctx) {
  if (!enabled || !track) return;

  const [px, py] = sample(playerS);
  const [ox, oy] = sample(opponentS);
  const [ptx, pty] = tangent(playerS);
  const [otx, oty] = tangent(opponentS);

  drawRider(ctx, px, py, ptx, pty, "#5ec8ff", "#9fffff");
  drawRider(ctx, ox, oy, -otx, -oty, "#ff6b6b", "#ffd0a0");

  for (const s of sparks) {
    const a = Math.max(0, s.life / s.max);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, ${Math.floor(180 + 75 * a)}, 80, ${a})`;
    ctx.arc(s.x, s.y, 4 + 6 * a, 0, Math.PI * 2);
    ctx.fill();
  }

  if (status === "crashed" || status === "won") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Banner is drawn in screen space by the Gleam HUD; sparks stay in world.
    ctx.restore();
  }
}

function drawRider(ctx, x, y, tx, ty, fill, glow) {
  const size = 14;
  const nx = -ty;
  const ny = tx;
  ctx.beginPath();
  ctx.moveTo(x + tx * size, y + ty * size);
  ctx.lineTo(x - tx * size * 0.7 + nx * size * 0.55, y - ty * size * 0.7 + ny * size * 0.55);
  ctx.lineTo(x - tx * size * 0.35, y - ty * size * 0.35);
  ctx.lineTo(x - tx * size * 0.7 - nx * size * 0.55, y - ty * size * 0.7 - ny * size * 0.55);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// Register with the canvas frame loop once this module loads.
setDuelHooks({
  onDrawing,
  tick,
  draw,
  isActive: () => enabled,
});
