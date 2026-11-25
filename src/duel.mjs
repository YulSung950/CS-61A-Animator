// Mirror duel: two riders race toward each other on the current drawing's
// path graph (player from the start, opponent from the end). Hold-to-move
// only — no momentum. Branches use A/D or ←/→ (default: furthest-right).
// vs AI: WASD or arrows steer the player. Hot-seat / PvP: WASD = player 1,
// arrow keys = player 2.

import { setDuelHooks } from "./canvas.mjs";

const COLLISION_EPS = 18; // world units
const MOVE_SPEED = 220; // world units / second while a move key is held
const AI_BASE = 90;
const AI_REACT = 70;
const SPARK_LIFE = 0.9;
const NODE_EPS = 1.5; // merge nearby vertices into one junction

let enabled = false;
let mode = "ai"; // "ai" | "hotseat"
let track = null; // { nodes, edges, adj, startNode, endNode }
let player = null;
let opponent = null;
let status = "idle"; // idle | playing | crashed | player_win | opponent_win
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
  if (!track || track.edges.length === 0) {
    player = null;
    opponent = null;
    status = "idle";
    notifyStatus();
    return;
  }
  player = placeRider(track.startNode, /*towardEnd=*/ true);
  opponent = placeRider(track.endNode, /*towardEnd=*/ false);
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
  if (status === "player_win") {
    return mode === "hotseat"
      ? "P1 WINS — Space to rematch"
      : "YOU WIN — Space to rematch";
  }
  if (status === "opponent_win") {
    return mode === "hotseat"
      ? "P2 WINS — Space to rematch"
      : "AI WINS — Space to rematch";
  }
  if (mode === "hotseat") {
    return "PvP · WASD vs Arrows · Space rematch";
  }
  return "Mirror duel · WASD or Arrows · Space rematch";
}

function ensureKeys() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
}

function clearKeys() {
  keys = Object.create(null);
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
    if (
      status === "crashed" ||
      status === "player_win" ||
      status === "opponent_win" ||
      status === "playing"
    ) {
      restartRound();
    }
  }
  // Prevent page scroll while steering with arrows.
  if (
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight"
  ) {
    e.preventDefault();
  }
}

function onKeyUp(e) {
  keys[e.key] = false;
}

function keyDown(name) {
  return !!keys[name];
}

/** Build a junction graph from the canvas path list (after setDrawing). */
export function onDrawing(paths) {
  track = buildTrack(paths);
  if (enabled) restartRound();
  else notifyStatus();
}

function buildTrack(paths) {
  const nodes = []; // {x,y}
  const edges = []; // {a,b,len,dx,dy}
  const adj = []; // node -> [{edge, to, outwardDx, outwardDy}]

  function quantize(x, y) {
    return [Math.round(x / NODE_EPS) * NODE_EPS, Math.round(y / NODE_EPS) * NODE_EPS];
  }

  function findOrAddNode(x, y) {
    const [qx, qy] = quantize(x, y);
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - qx, nodes[i].y - qy) <= NODE_EPS) return i;
    }
    const id = nodes.length;
    nodes.push({ x: qx, y: qy });
    adj.push([]);
    return id;
  }

  function addEdge(a, b) {
    if (a === b) return;
    // Skip duplicate undirected edges.
    for (const link of adj[a]) {
      if (link.to === b) return;
    }
    const ax = nodes[a].x;
    const ay = nodes[a].y;
    const bx = nodes[b].x;
    const by = nodes[b].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const id = edges.length;
    edges.push({ a, b, len, dx, dy });
    adj[a].push({ edge: id, to: b, outwardDx: dx / len, outwardDy: dy / len });
    adj[b].push({ edge: id, to: a, outwardDx: -dx / len, outwardDy: -dy / len });
  }

  let startNode = -1;
  let endNode = -1;
  for (const p of paths) {
    const pts = p.pts;
    if (!pts || pts.length < 4) continue;
    let prev = -1;
    for (let i = 0; i < pts.length; i += 2) {
      const n = findOrAddNode(pts[i], pts[i + 1]);
      if (startNode < 0) startNode = n;
      endNode = n;
      if (prev >= 0) addEdge(prev, n);
      prev = n;
    }
  }

  if (edges.length === 0 || startNode < 0) return null;
  return { nodes, edges, adj, startNode, endNode };
}

/** Place a rider on an edge leaving `node`, facing toward/away from the end. */
function placeRider(node, towardEnd) {
  const links = track.adj[node];
  if (!links.length) return null;
  // Prefer the link that points closest to (or away from) the opposite terminus.
  const target = towardEnd ? track.endNode : track.startNode;
  const tx = track.nodes[target].x - track.nodes[node].x;
  const ty = track.nodes[target].y - track.nodes[node].y;
  let best = links[0];
  let bestDot = -Infinity;
  for (const link of links) {
    const dot = link.outwardDx * tx + link.outwardDy * ty;
    if (dot > bestDot) {
      bestDot = dot;
      best = link;
    }
  }
  const edge = track.edges[best.edge];
  const forward = best.to === edge.b; // traveling a→b
  return {
    edge: best.edge,
    t: forward ? 0 : 1, // progress along edge a→b
    // facing: +1 toward b, -1 toward a (direction of travel / sprite).
    facing: forward ? 1 : -1,
    // True while Back is held after the one-shot turnaround on press.
    reversing: false,
  };
}

export function tick(dt) {
  if (!enabled || !track || status !== "playing" || !player || !opponent) {
    ageSparks(dt);
    return;
  }

  const pControls = readControls("wasd");
  const arrowControls = readControls("arrows");

  if (mode === "hotseat") {
    // PvP: WASD steers player 1 only; arrows steers player 2 only.
    stepRider(player, pControls, dt, MOVE_SPEED);
    stepRider(opponent, arrowControls, dt, MOVE_SPEED);
  } else {
    // vs AI: either scheme steers the player; arrows win if both pressed.
    const merged = mergeControls(pControls, arrowControls);
    stepRider(player, merged, dt, MOVE_SPEED);
    stepAi(opponent, player, dt);
  }

  const [px, py] = riderPos(player);
  const [ox, oy] = riderPos(opponent);
  if (Math.hypot(px - ox, py - oy) <= COLLISION_EPS) {
    status = "crashed";
    spawnSparks([(px + ox) / 2, (py + oy) / 2]);
    notifyStatus();
  } else if (reachedGoal(player, track.endNode)) {
    status = "player_win";
    notifyStatus();
  } else if (reachedGoal(opponent, track.startNode)) {
    status = "opponent_win";
    notifyStatus();
  }

  ageSparks(dt);
}

function readControls(scheme) {
  if (scheme === "wasd") {
    return {
      forward: keyDown("w") || keyDown("W"),
      back: keyDown("s") || keyDown("S"),
      left: keyDown("a") || keyDown("A"),
      right: keyDown("d") || keyDown("D"),
    };
  }
  return {
    forward: keyDown("ArrowUp"),
    back: keyDown("ArrowDown"),
    left: keyDown("ArrowLeft"),
    right: keyDown("ArrowRight"),
  };
}

function mergeControls(a, b) {
  return {
    forward: a.forward || b.forward,
    back: a.back || b.back,
    left: a.left || b.left,
    right: a.right || b.right,
  };
}

/**
 * Hold-to-move along the current edge; stop instantly on release (no coast).
 * Forward moves along `facing`. Back turns around once on press, then moves
 * along the new facing while held (no per-frame flip / no momentum).
 * At junctions, Left/Right pick a branch; default is furthest-right.
 */
function stepRider(rider, controls, dt, speed) {
  if (!rider) return;

  const wantBack = controls.back && !controls.forward;
  const wantFwd = controls.forward && !controls.back;

  if (wantBack) {
    if (!rider.reversing) {
      rider.facing *= -1;
      rider.reversing = true;
    }
  } else {
    rider.reversing = false;
  }

  if (!wantBack && !wantFwd) return; // released → stop immediately

  let travel = rider.facing; // +1 toward b, -1 toward a
  let remaining = speed * dt;
  let guard = 0;
  while (remaining > 1e-6 && guard++ < 8) {
    const edge = track.edges[rider.edge];
    const travelingToB = travel > 0;
    const distToEnd = travelingToB ? (1 - rider.t) * edge.len : rider.t * edge.len;

    if (remaining < distToEnd) {
      const dtFrac = remaining / edge.len;
      rider.t += travelingToB ? dtFrac : -dtFrac;
      remaining = 0;
      break;
    }

    remaining -= distToEnd;
    const node = travelingToB ? edge.b : edge.a;
    rider.t = travelingToB ? 1 : 0;
    const next = chooseBranch(node, rider.edge, travel, controls);
    if (!next) {
      remaining = 0;
      break;
    }
    rider.edge = next.edge;
    const nEdge = track.edges[next.edge];
    travel = next.to === nEdge.b ? 1 : -1;
    rider.facing = travel;
    rider.t = travel > 0 ? 0 : 1;
  }
}

function chooseBranch(node, fromEdge, facing, controls) {
  const ranked = rankBranches(node, fromEdge, facing);
  if (!ranked) return null;
  if (ranked.length === 0) {
    // Only way back is the edge we came from — U-turn.
    return track.adj[node].find((link) => link.edge === fromEdge) || null;
  }

  if (controls.left && !controls.right) {
    // Furthest-left = reverse of rightmost ranking.
    return ranked[ranked.length - 1].link;
  }
  if (controls.right && !controls.left) {
    return ranked[0].link;
  }
  // Default: furthest-right path.
  return ranked[0].link;
}

/** Rank outgoing links by screen-right turn (desc), then forward (desc). */
function rankBranches(node, fromEdge, facing) {
  const edge = track.edges[fromEdge];
  if (!edge) return null;
  // Incoming heading (direction we were traveling as we arrived).
  const inDx = facing > 0 ? edge.dx / edge.len : -edge.dx / edge.len;
  const inDy = facing > 0 ? edge.dy / edge.len : -edge.dy / edge.len;

  const options = track.adj[node].filter((link) => link.edge !== fromEdge);
  return options
    .map((link) => {
      const cross = inDx * link.outwardDy - inDy * link.outwardDx;
      const dot = inDx * link.outwardDx + inDy * link.outwardDy;
      return { link, cross, dot };
    })
    .sort((a, b) => {
      // Prefer rightmost (higher cross); tie-break by most forward (higher dot).
      if (Math.abs(b.cross - a.cross) > 1e-9) return b.cross - a.cross;
      return b.dot - a.dot;
    });
}

/**
 * AI advances along its current facing (no mid-edge Euclidean flip — that
 * trapped riders on tree leaves where a tip looked closer than its parent).
 * It races toward startNode (mirror-duel goal). At junctions it picks the
 * exit that reduces BFS distance to start; ties fall back to furthest-right.
 * Speed still reacts to the gap to the player.
 */
function stepAi(rider, target, dt) {
  if (!rider || !target) return;
  const [tx, ty] = riderPos(target);
  const [rx, ry] = riderPos(rider);
  const gap = Math.hypot(tx - rx, ty - ry);
  const speed = AI_BASE + AI_REACT * Math.max(0, 1 - gap / 500);

  // Race toward the player's starting terminus, not the player's live tip
  // (Euclidean-to-player facing was what stuck the AI on tree leaves).
  const goals = new Set([track.startNode]);
  let remaining = speed * dt;
  let guard = 0;
  while (remaining > 1e-6 && guard++ < 8) {
    const e = track.edges[rider.edge];
    const travelingToB = rider.facing > 0;
    const distToEnd = travelingToB ? (1 - rider.t) * e.len : rider.t * e.len;
    if (remaining < distToEnd) {
      const dtFrac = remaining / e.len;
      rider.t += travelingToB ? dtFrac : -dtFrac;
      remaining = 0;
      break;
    }
    remaining -= distToEnd;
    const node = travelingToB ? e.b : e.a;
    rider.t = travelingToB ? 1 : 0;
    const pick = chooseAiBranch(node, rider.edge, rider.facing, goals);
    if (!pick) {
      remaining = 0;
      break;
    }
    rider.edge = pick.edge;
    const nEdge = track.edges[pick.edge];
    rider.facing = pick.to === nEdge.b ? 1 : -1;
    rider.t = rider.facing > 0 ? 0 : 1;
  }
}

/** BFS hop-distance from `from` to any node in `goals` (Infinity if none). */
function bfsDist(from, goals) {
  if (goals.has(from)) return 0;
  const seen = new Uint8Array(track.nodes.length);
  seen[from] = 1;
  const queue = [from];
  let head = 0;
  let dist = 0;
  while (head < queue.length) {
    const size = queue.length - head;
    dist += 1;
    for (let i = 0; i < size; i++) {
      const n = queue[head++];
      for (const link of track.adj[n]) {
        if (seen[link.to]) continue;
        if (goals.has(link.to)) return dist;
        seen[link.to] = 1;
        queue.push(link.to);
      }
    }
  }
  return Infinity;
}

function chooseAiBranch(node, fromEdge, facing, goals) {
  const ranked = rankBranches(node, fromEdge, facing);
  if (!ranked) return null;
  if (ranked.length === 0) {
    return track.adj[node].find((link) => link.edge === fromEdge) || null;
  }

  let bestDist = Infinity;
  const contenders = [];
  for (const item of ranked) {
    const d = bfsDist(item.link.to, goals);
    if (d < bestDist) {
      bestDist = d;
      contenders.length = 0;
      contenders.push(item);
    } else if (d === bestDist) {
      contenders.push(item);
    }
  }

  // Among shortest graph paths, keep furthest-right (already sorted that way).
  if (contenders.length) return contenders[0].link;
  // Fallback: furthest-right outgoing path.
  return ranked[0].link;
}

function riderPos(rider) {
  if (!rider || !track) return [0, 0];
  const e = track.edges[rider.edge];
  const ax = track.nodes[e.a].x;
  const ay = track.nodes[e.a].y;
  const bx = track.nodes[e.b].x;
  const by = track.nodes[e.b].y;
  return [ax + (bx - ax) * rider.t, ay + (by - ay) * rider.t];
}

function riderTangent(rider) {
  if (!rider || !track) return [1, 0];
  const e = track.edges[rider.edge];
  const len = e.len || 1;
  return [(e.dx / len) * rider.facing, (e.dy / len) * rider.facing];
}

function reachedGoal(rider, goalNode) {
  if (!rider || !track) return false;
  const e = track.edges[rider.edge];
  const atA = rider.t <= 0.02;
  const atB = rider.t >= 0.98;
  if (atA && e.a === goalNode) return true;
  if (atB && e.b === goalNode) return true;
  return false;
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

export function draw(ctx) {
  if (!enabled || !track || !player || !opponent) return;

  const [px, py] = riderPos(player);
  const [ox, oy] = riderPos(opponent);
  const [ptx, pty] = riderTangent(player);
  const [otx, oty] = riderTangent(opponent);

  drawRider(ctx, px, py, ptx, pty, "#5ec8ff", "#9fffff");
  drawRider(ctx, ox, oy, otx, oty, "#ff6b6b", "#ffd0a0");

  for (const s of sparks) {
    const a = Math.max(0, s.life / s.max);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, ${Math.floor(180 + 75 * a)}, 80, ${a})`;
    ctx.arc(s.x, s.y, 4 + 6 * a, 0, Math.PI * 2);
    ctx.fill();
  }

  if (
    status === "crashed" ||
    status === "player_win" ||
    status === "opponent_win"
  ) {
    drawResultBanner(ctx);
  }
}

function drawResultBanner(ctx) {
  const label = statusLabel().split(" — ")[0] || statusLabel();
  ctx.save();
  // Canvas is in world space (origin center). Draw a readable screen-space banner.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const bannerH = Math.max(48, Math.round(h * 0.12));
  const y = h * 0.18;
  ctx.fillStyle = "rgba(8, 12, 24, 0.78)";
  ctx.fillRect(0, y - bannerH / 2, w, bannerH);

  let color = "#ffd080";
  if (status === "player_win") color = "#7dffb0";
  else if (status === "opponent_win") color = "#ff8a8a";
  else if (status === "crashed") color = "#ffc078";

  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(2, Math.round(h * 0.006));
  ctx.font = `bold ${Math.max(28, Math.round(h * 0.07))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(label, w / 2, y);
  ctx.fillText(label, w / 2, y);
  ctx.restore();
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

// Register with the canvas frame loop once this module loads.
setDuelHooks({
  onDrawing,
  tick,
  draw,
  isActive: () => enabled,
});
