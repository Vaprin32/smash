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
import { drawRig, hueShift, rgbOf, solveRig, type Rig } from './skeleton';
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
  drawRig(ctx, rig, look, {
    x,
    y,
    facing: f.facing,
    color: f.action === Action.SpecialFall ? '#7c8592' : color,
    alpha,
    outline: intangible ? '#ffffff' : undefined,
    time: performance.now(),
    vx: f.vx / ONE,
  });
  drawAttackFx(ctx, f, slot, rig, x, y, color);
  if (charging > 0) {
    // Pulsing glow that grows with charge.
    const pulse = 0.25 + 0.25 * Math.sin(performance.now() * 0.025);
    ctx.fillStyle = `rgba(255,240,170,${(pulse * (0.4 + charging)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y - st.height / ONE / 2, st.height / ONE / 2 + 6 * charging, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.action === Action.Hitstun && f.actionFrame < 6) {
    ctx.fillStyle = 'rgba(255,60,60,0.16)';
    ctx.beginPath();
    ctx.arc(x, y - st.height / ONE / 2, st.height / ONE / 2, 0, Math.PI * 2);
    ctx.fill();
  }

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

/** Recent positions of each fighter's striking limb (render memory only), for motion smears. */
const trails = new Map<number, { x: number; y: number; t: number }[]>();
const TRAIL_MS = 130;

/**
 * Attacks, drawn so they read without the debug view: a motion smear behind
 * whichever hand, foot or head is nearest the active hitbox, and a soft glow
 * over the hitbox itself. Low quality draws plain outlines instead.
 */
function drawAttackFx(ctx: CanvasRenderingContext2D, f: FighterState, slot: number, rig: Rig, x: number, y: number, color: string): void {
  const boxes = activeHitboxes(f);
  if (!gfx.trails) return drawSwipes(ctx, f, color, boxes);
  const now = performance.now();
  let pts = trails.get(slot);
  if (!pts) trails.set(slot, (pts = []));
  if (boxes.length > 0) {
    // The limb tip nearest the first hitbox (pose space faces right; y up from the feet).
    const hb = boxes[0]!;
    const hx = hb.x / ONE, hy = hb.y / ONE;
    let tip = rig.handF;
    let best = Infinity;
    for (const p of [rig.handF, rig.handB, rig.footF, rig.footB, rig.head]) {
      const d = (p.x - hx) ** 2 + (p.y - hy) ** 2;
      if (d < best) [best, tip] = [d, p];
    }
    pts.push({ x: x + f.facing * tip.x, y: y + tip.y, t: now });
  }
  while (pts.length > 0 && now - pts[0]!.t > TRAIL_MS) pts.shift();

  ctx.save();
  ctx.globalCompositeOperation = gfx.lights ? 'lighter' : 'source-over';
  // Smear: a ribbon through the recent tip positions, widest and brightest at the newest end.
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const k = 1 - (now - b.t) / TRAIL_MS;
    if (k <= 0) continue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = k * 0.55;
    ctx.lineCap = 'round';
    ctx.lineWidth = 14 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = k * 0.8;
    ctx.lineWidth = 5 * k;
    ctx.stroke();
  }
  // Soft glow over each active hitbox (moves that hit away from the body still show where).
  ctx.globalAlpha = 1;
  for (const b of boxes) {
    const cx = (f.x + f.facing * b.x) / ONE, cy = (f.y + b.y) / ONE, r = b.r / ONE;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.1);
    g.addColorStop(0, 'rgba(255,255,240,0.35)');
    g.addColorStop(0.6, hexAlpha(color, 0.18));
    g.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Any color as rgba with alpha `a`, for gradients. */
function hexAlpha(color: string, a: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r},${g},${b},${a})`;
}

/** Low quality: a translucent circle over each active hitbox. */
function drawSwipes(ctx: CanvasRenderingContext2D, f: FighterState, color: string, boxes: ReturnType<typeof activeHitboxes>): void {
  for (const b of boxes) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((f.x + f.facing * b.x) / ONE, (f.y + b.y) / ONE, b.r / ONE, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
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
