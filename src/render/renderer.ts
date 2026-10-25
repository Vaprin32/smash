import { Action } from '../sim/actions';
import { activeHitboxes, isIntangible } from '../sim/combat';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import type { FighterState, MatchState } from '../sim/state';
import { SHIELD_MAX } from '../sim/rules';
import { animate } from './animations';
import type { Camera } from './camera';
import { LOOKS, type FighterLook } from './looks';
import { gfx } from './quality';
import { drawRig, hueShift, rgbOf, solveRig, type Pt, type Rig } from './skeleton';
import { drawAmbience, drawBackground, drawGroundShadow, drawStageArt, drawStageLights } from './scenery';
import { SERIF, THEME } from './theme';

/** Per player slot (red, blue, gold, green): name tags, cursors, shields. Fighters wear their own colors. */
export const SLOT_COLORS = ['#d8453b', '#3f7fdc', '#e2b23a', '#45a85a'];

export function slotColor(slot: number): string {
  return SLOT_COLORS[slot % SLOT_COLORS.length]!;
}

export function lookOf(charId: number): FighterLook {
  return LOOKS[charId % LOOKS.length]!;
}

/**
 * A fighter's outfit color. Each earlier slot with the same fighter moves this
 * one along: body, alternate, then hue-shifted versions of both.
 */
export function fighterColor(chars: readonly number[], slot: number): string {
  const look = lookOf(chars[slot]!);
  const copy = chars.slice(0, slot).filter((c) => c === chars[slot]).length;
  return [look.body, look.alt, hueShift(look.body, 140), hueShift(look.alt, 140)][copy % 4]!;
}

/** `labels` replaces a fighter's "P1" overhead tag (e.g. "CPU 2"). */
export function drawWorld(ctx: CanvasRenderingContext2D, state: MatchState, cam: Camera, w: number, h: number, labels: readonly string[] = []): void {
  const t = performance.now();
  const stage = STAGES[state.stageId]!;
  drawBackground(ctx, cam, w, h, t, undefined, stage.theme);
  cam.apply(ctx, w, h);
  drawStageArt(ctx, stage, t, SLOT_COLORS, state.frame);
  for (const f of state.fighters) {
    if (f.action === Action.KO || f.action === Action.Out) continue;
    drawGroundShadow(ctx, stage, f.x / ONE, f.y / ONE, FIGHTERS[f.charId]!.stats.width / ONE + 16, state.frame);
  }
  const chars = state.fighters.map((f) => f.charId);
  state.fighters.forEach((f, i) => drawFighter(ctx, state, f, i, fighterColor(chars, i), labels[i] || `P${i + 1}`));
  state.fighters.forEach((f, i) => drawProjectile(ctx, f, fighterColor(chars, i)));
  drawStageLights(ctx, t);
  drawAmbience(ctx, stage.theme, t);
}

function drawFighter(ctx: CanvasRenderingContext2D, state: MatchState, f: FighterState, slot: number, color: string, label: string): void {
  if (f.action === Action.KO || f.action === Action.Out) return;
  const st = FIGHTERS[f.charId]!.stats;
  const look = lookOf(f.charId);
  const tag = slotColor(slot);
  const intangible = isIntangible(f, st);

  let x = f.x / ONE;
  const y = f.y / ONE;
  // Hitlag / shieldstun shake (derived from state, never written back).
  if (f.hitlag > 0 && (f.action === Action.Hitstun || f.action === Action.ShieldStun)) x += state.frame & 1 ? 3 : -3;


  const { pose, planted, charging } = animate(f, state);
  // Charging a smash: tremble.
  if (charging > 0) x += Math.sin(performance.now() * 0.08) * (1 + charging * 2);

  let alpha = 1;
  if (f.invincible > 0 && (state.frame >> 2) & 1) alpha = 0.45;
  if (intangible && f.invincible === 0) alpha = 0.5;
  const rig = solveRig(pose, look, planted);
  const now = performance.now();
  // Outline flashes: red as a hit lands, warm white flickering while a smash charges.
  let outline: string | undefined;
  if (intangible) outline = '#ffffff';
  else if (f.action === Action.Hitstun && f.actionFrame < 6) outline = '#ff4a3a';
  else if (charging > 0 && Math.sin(now * 0.04) > 0.2 - charging) outline = '#ffe9a0';
  drawRig(ctx, rig, look, {
    x,
    y,
    facing: f.facing,
    color: f.action === Action.SpecialFall ? '#7c8592' : color,
    alpha,
    outline,
    time: now,
    vx: f.vx / ONE,
  });
  drawAttackFx(ctx, f, slot, rig, look, x, y, color);
  if (charging > 0) drawCharge(ctx, f, rig, look, x, y, charging, now);

  drawShield(ctx, f, x, y - st.height / ONE / 2, st.height / ONE, tag);
  if (f.action === Action.ShieldBreak && f.ground >= 0) drawDizzy(ctx, x, y - st.height / ONE - 14, state.frame);

  if (f.action === Action.Respawn) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - 40, y, 80, 5);
  }

  // Player tag with a small pointer, in the slot color.
  const ty = y - st.height / ONE - 22;
  ctx.font = `bold 15px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#11131f';
  ctx.strokeText(label, x, ty);
  ctx.fillStyle = tag;
  ctx.fillText(label, x, ty);
  ctx.beginPath();
  ctx.moveTo(x - 5, ty + 4);
  ctx.lineTo(x + 5, ty + 4);
  ctx.lineTo(x, ty + 10);
  ctx.closePath();
  ctx.fill();
}

/** Neutral special projectile, drawn in the owner's style and color. */
function drawProjectile(ctx: CanvasRenderingContext2D, f: FighterState, color: string): void {
  if (f.projLife <= 0) return;
  const x = f.projX / ONE, y = f.projY / ONE;
  const dir = Math.sign(f.projVx || 1);
  const t = performance.now();
  const spin = t * 0.02 * dir;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  switch (lookOf(f.charId).projectile) {
    case 'gauntlet': {
      // A tumbling steel gauntlet: plated cuff, fingers, owner-colored lining.
      ctx.translate(x, y);
      ctx.rotate(spin * 0.6);
      ctx.fillStyle = '#c9ced6';
      ctx.strokeStyle = THEME.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-9, -6, 11, 12, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#aab1bb';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.roundRect(2, -6 + k * 3, 8, 2.6, 1.2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.fillRect(-9, -6, 3, 12);
      break;
    }
    case 'pebble':
      ctx.fillStyle = '#b9a58a';
      ctx.strokeStyle = '#11131f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 6, spin * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'dart':
      // An arrow: wooden shaft, iron head, fletching in the owner's color.
      ctx.strokeStyle = '#8a5a32';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - dir * 14, y);
      ctx.lineTo(x + dir * 8, y);
      ctx.stroke();
      ctx.fillStyle = '#c8c0b0';
      ctx.strokeStyle = THEME.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + dir * 15, y);
      ctx.lineTo(x + dir * 7, y - 4);
      ctx.lineTo(x + dir * 7, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x - dir * 8, y);
        ctx.lineTo(x - dir * 15, y + side * 5);
        ctx.lineTo(x - dir * 12, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'orb': {
      const pulse = 1 + Math.sin(t * 0.012) * 0.12;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 18 * pulse);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crescent': {
      // An arc bulging the way it travels.
      const a0 = dir > 0 ? -1.1 : Math.PI - 1.1;
      ctx.beginPath();
      ctx.arc(x - dir * 6, y, 15, a0, a0 + 2.2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#11131f';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    default: {
      // Gust: a small spinning swirl.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x, y, 6 + k * 3, spin + k * 2, spin + k * 2 + 2.2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** A point that can strike, and the joint it swings around (pose space). */
interface Striker {
  tip: Pt;
  root: Pt;
  /** Which limb or weapon (index into strikers()). */
  id?: number;
}

/** Hands, feet, head, and the business end of a held weapon. */
function strikers(rig: Rig, look: FighterLook): Striker[] {
  const out: Striker[] = [
    { tip: rig.handF, root: rig.shoulder },
    { tip: rig.handB, root: rig.shoulder },
    { tip: rig.footF, root: rig.hip },
    { tip: rig.footB, root: rig.hip },
    { tip: rig.head, root: rig.shoulder },
  ];
  if (look.costume === 'duelist') {
    // Rapier along the forearm (skeleton.ts draws it 44 px past the hand).
    const dx = rig.handF.x - rig.elbowF.x, dy = rig.handF.y - rig.elbowF.y;
    const d = Math.hypot(dx, dy) || 1;
    out.push({ tip: { x: rig.handF.x + (dx / d) * 44, y: rig.handF.y + (dy / d) * 44 }, root: rig.handF });
  } else if (look.costume === 'cleric') {
    out.push({ tip: { x: rig.handB.x, y: rig.handB.y - 31 }, root: rig.handB }); // staff head
  }
  return out;
}

/** The striker nearest a pose-space point. */
function nearestStriker(rig: Rig, look: FighterLook, x: number, y: number): Striker {
  let best = Infinity;
  let pick: Striker | undefined;
  for (const [i, s] of strikers(rig, look).entries()) {
    const d = (s.tip.x - x) ** 2 + (s.tip.y - y) ** 2;
    if (d < best) [best, pick] = [d, { ...s, id: i }];
  }
  return pick!;
}

/**
 * Recent striker positions per fighter slot, in the fighter's own pose space
 * (so the swing stays attached to them while they move). Render memory only.
 */
interface Swing {
  move: number;
  /** The striker being traced; switching limbs starts a fresh trail. */
  limb: number;
  pts: { tx: number; ty: number; rx: number; ry: number; t: number }[];
}
const swings = new Map<number, Swing>();
const SWING_MS = 150;
/** Move frames before a hitbox comes out that the swing is already traced. */
const SWING_LEAD = 3;

/**
 * Attacks, drawn so they read without the debug view: a tapered swoosh swept
 * by the striking hand, foot, head or weapon, and a crescent slash at each
 * active hitbox, bulging the way it launches. No round glows.
 */
function drawAttackFx(ctx: CanvasRenderingContext2D, f: FighterState, slot: number, rig: Rig, look: FighterLook, x: number, y: number, color: string): void {
  const boxes = activeHitboxes(f);
  const now = performance.now();
  const move = f.action === Action.Attack ? f.move : -1;
  let sw = swings.get(slot);
  if (!sw || sw.move !== move) swings.set(slot, (sw = { move, limb: -1, pts: [] }));
  const pts = sw.pts;
  // Follow the limb from a few frames before the hitbox comes out, so the ribbon shows the whole swing.
  const aim = boxes[0] ?? (move >= 0 ? FIGHTERS[f.charId]!.moves[move]?.hitboxes.find((h) => f.actionFrame < h.start && f.actionFrame >= h.start - SWING_LEAD) : undefined);
  if (aim) {
    const s = nearestStriker(rig, look, aim.x / ONE, aim.y / ONE);
    if (s.id !== sw.limb) [sw.limb, pts.length] = [s.id!, 0];
    pts.push({ tx: s.tip.x, ty: s.tip.y, rx: s.root.x, ry: s.root.y, t: now });
  }
  while (pts.length > 0 && now - pts[0]!.t > SWING_MS) pts.shift();
  if (pts.length < 2 && boxes.length === 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f.facing, 1);
  ctx.globalCompositeOperation = gfx.lights ? 'lighter' : 'source-over';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (pts.length >= 2) drawSwoosh(ctx, pts, now, color);
  boxes.slice(0, 3).forEach((b, i) => {
    const span = b.end - b.start + 1;
    const k = 1 - (f.actionFrame - b.start) / span; // 1 on the first active frame
    drawSlash(ctx, b.x / ONE, b.y / ONE, b.r / ONE, b.angle, k * (i === 0 ? 1 : 0.6), color);
  });
  ctx.restore();
}

/**
 * The swept area between the tip's path and a line partway toward its root:
 * widest and brightest at the newest end, thinning to a point at the oldest,
 * with a white-hot leading edge.
 */
function drawSwoosh(ctx: CanvasRenderingContext2D, pts: Swing['pts'], now: number, color: string): void {
  const n = pts.length;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const age = Math.min(1, (now - p.t) / SWING_MS);
    const w = 0.5 * (i / (n - 1)) * (1 - age * 0.5); // 0 at the oldest sample
    outer.push({ x: p.tx, y: p.ty });
    inner.push({ x: p.tx + (p.rx - p.tx) * w, y: p.ty + (p.ry - p.ty) * w });
  }
  // Barely moved (a poke): the ribbon would be a dot; the slash covers it.
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(outer[i]!.x - outer[i - 1]!.x, outer[i]!.y - outer[i - 1]!.y);
  if (len < 6) return;
  const head = 1 - Math.min(1, (now - pts[n - 1]!.t) / SWING_MS);
  const tail = outer[0]!, tip = outer[n - 1]!;
  if (gfx.trails) {
    const g = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
    g.addColorStop(0, hexAlpha(color, 0));
    g.addColorStop(0.55, hexAlpha(color, 0.45 * head));
    g.addColorStop(1, `rgba(255,255,255,${(0.85 * head).toFixed(3)})`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = hexAlpha(color, 0.5 * head);
  }
  ctx.beginPath();
  smoothPath(ctx, outer, false);
  smoothPath(ctx, inner.reverse(), true);
  ctx.closePath();
  ctx.fill();
  // Leading edge.
  ctx.strokeStyle = `rgba(255,255,255,${(0.9 * head).toFixed(3)})`;
  ctx.lineWidth = gfx.trails ? 2.2 : 1.5;
  ctx.beginPath();
  smoothPath(ctx, outer.slice(Math.floor(n / 3)), false);
  ctx.stroke();
}

/** Quadratic curves through midpoints, so per-frame samples read as one smooth arc. */
function smoothPath(ctx: CanvasRenderingContext2D, p: Pt[], cont: boolean): void {
  if (cont) ctx.lineTo(p[0]!.x, p[0]!.y);
  else ctx.moveTo(p[0]!.x, p[0]!.y);
  for (let i = 1; i < p.length - 1; i++) {
    ctx.quadraticCurveTo(p[i]!.x, p[i]!.y, (p[i]!.x + p[i + 1]!.x) / 2, (p[i]!.y + p[i + 1]!.y) / 2);
  }
  const last = p[p.length - 1]!;
  ctx.lineTo(last.x, last.y);
}

/**
 * A crescent slash over a hitbox, bulging toward its launch angle (degrees,
 * 0 = forward, 90 = up; pose space already faces forward), tapered at both
 * horns. `k` is 1 when the hitbox comes out and fades toward 0.
 */
function drawSlash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angleDeg: number, k: number, color: string): void {
  if (k <= 0) return;
  const dir = (-angleDeg * Math.PI) / 180; // canvas y is down
  const ux = Math.cos(dir), uy = Math.sin(dir);
  const spread = 1.25; // half the arc, radians
  const ro = r * (0.85 + (1 - k) * 0.3); // sweeps outward a little as it fades
  const thick = r * 0.55 * (0.4 + 0.6 * k);
  // Outer edge: an arc around a center pulled back against the launch.
  const ox = cx - ux * r * 0.35, oy = cy - uy * r * 0.35;
  // Inner edge: through the same horns from a center further back, so the band is thickest in the middle.
  const ix = ox - ux * thick, iy = oy - uy * thick;
  const a0 = dir - spread, a1 = dir + spread;
  const h0x = ox + Math.cos(a0) * ro, h0y = oy + Math.sin(a0) * ro;
  const h1x = ox + Math.cos(a1) * ro, h1y = oy + Math.sin(a1) * ro;
  const ri = Math.hypot(h0x - ix, h0y - iy);
  const b0 = Math.atan2(h0y - iy, h0x - ix), b1 = Math.atan2(h1y - iy, h1x - ix);

  ctx.beginPath();
  ctx.arc(ox, oy, ro, a0, a1);
  ctx.arc(ix, iy, ri, b1, b0, true);
  ctx.closePath();
  if (gfx.trails) {
    const g = ctx.createLinearGradient(ix, iy, ox + ux * ro, oy + uy * ro);
    g.addColorStop(0, hexAlpha(color, 0));
    g.addColorStop(0.5, hexAlpha(color, 0.75 * k));
    g.addColorStop(1, `rgba(255,255,255,${(0.9 * k).toFixed(3)})`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = hexAlpha(color, 0.45 * k);
  }
  ctx.fill();
  // Bright rim along the outer edge.
  ctx.strokeStyle = `rgba(255,255,255,${(0.85 * k).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, r * 0.08) * (0.5 + k * 0.5);
  ctx.beginPath();
  ctx.arc(ox, oy, ro, a0 + 0.25, a1 - 0.25);
  ctx.stroke();
  // A couple of speed lines trailing off behind it.
  if (gfx.trails && k > 0.3) {
    ctx.strokeStyle = hexAlpha(color, 0.55 * k);
    ctx.lineWidth = 1.5;
    for (const side of [-0.45, 0.45]) {
      const sx = cx + Math.cos(dir + side) * r * 0.2, sy = cy + Math.sin(dir + side) * r * 0.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - ux * r * 0.9 * k, sy - uy * r * 0.9 * k);
      ctx.stroke();
    }
  }
}

/** Any color as rgba with alpha `a`, for gradients. */
function hexAlpha(color: string, a: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Charging a smash: light streaks drawn in toward the striking limb, and a
 * twinkle on it that grows with the charge. `t` is render time in ms.
 */
function drawCharge(ctx: CanvasRenderingContext2D, f: FighterState, rig: Rig, look: FighterLook, x: number, y: number, charging: number, t: number): void {
  const hb = FIGHTERS[f.charId]!.moves[f.move]?.hitboxes[0];
  const s = hb ? nearestStriker(rig, look, hb.x / ONE, hb.y / ONE) : { tip: rig.handF, root: rig.shoulder };
  const { x: sx, y: sy } = s.tip;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f.facing, 1);
  ctx.globalCompositeOperation = gfx.lights ? 'lighter' : 'source-over';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  // Streaks: each slides inward over a 400 ms cycle, staggered, from a new direction every cycle.
  const count = gfx.trails ? 6 : 3;
  for (let i = 0; i < count; i++) {
    const cycle = t / 400 + i / count;
    const phase = cycle % 1;
    const ang = i * 2.39996 + Math.floor(cycle) * 1.7;
    const d0 = (34 + 10 * charging) * (1 - phase), d1 = Math.max(4, d0 - 12);
    ctx.strokeStyle = `rgba(255,244,190,${((0.3 + 0.6 * charging) * Math.sin(phase * Math.PI)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(ang) * d0, sy + Math.sin(ang) * d0);
    ctx.lineTo(sx + Math.cos(ang) * d1, sy + Math.sin(ang) * d1);
    ctx.stroke();
  }
  // Four-point twinkle on the limb.
  const size = 5 + 9 * charging + Math.sin(t * 0.03) * 1.5;
  ctx.fillStyle = `rgba(255,250,220,${(0.55 + 0.4 * charging).toFixed(3)})`;
  ctx.translate(sx, sy);
  ctx.rotate(t * 0.004);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const r = k % 2 === 0 ? size : size * 0.18;
    const a = (k / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Shield bubble: shrinks with shield HP; fades out while being dropped. */
function drawShield(ctx: CanvasRenderingContext2D, f: FighterState, cx: number, cy: number, h: number, color: string): void {
  let fade = 0;
  if (f.action === Action.Shield || f.action === Action.ShieldStun) fade = 1;
  else if (f.action === Action.ShieldDrop) fade = Math.max(0, 1 - f.actionFrame / 4);
  if (fade <= 0) return;
  const hp = f.shieldHp / SHIELD_MAX;
  const r = h * (0.25 + 0.4 * hp);
  ctx.save();
  ctx.globalAlpha = fade;
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.globalAlpha = fade * (f.action === Action.ShieldStun ? 0.7 : 0.45);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = f.action === Action.ShieldStun ? '#ffffff' : color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawDizzy(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  ctx.fillStyle = '#ffe14f';
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.12 + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 16;
    const sy = y + Math.sin(a) * 5;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 5 : 2.2;
      const ang = (k / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(sx + Math.cos(ang) * r, sy + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}
