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
import { drawRig, solveRig } from './skeleton';

/** Per player slot: name tags, cursors, shields. Fighters wear their own colors. */
export const SLOT_COLORS = ['#ff5a5a', '#4f9dff'];

export function slotColor(slot: number): string {
  return SLOT_COLORS[slot % SLOT_COLORS.length]!;
}

export function lookOf(charId: number): FighterLook {
  return LOOKS[charId % LOOKS.length]!;
}

/** A fighter's outfit color; the alternate if an earlier slot picked the same fighter. */
export function fighterColor(chars: readonly number[], slot: number): string {
  const look = lookOf(chars[slot]!);
  return chars.slice(0, slot).includes(chars[slot]!) ? look.alt : look.body;
}

export function drawWorld(ctx: CanvasRenderingContext2D, state: MatchState, cam: Camera, w: number, h: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1b2147');
  sky.addColorStop(1, '#3a2f5c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  cam.apply(ctx, w, h);
  drawStage(ctx, state);
  const chars = state.fighters.map((f) => f.charId);
  state.fighters.forEach((f, i) => drawFighter(ctx, state, f, i, fighterColor(chars, i)));
  state.fighters.forEach((f, i) => drawProjectile(ctx, f, fighterColor(chars, i)));
}

function drawStage(ctx: CanvasRenderingContext2D, state: MatchState): void {
  const stage = STAGES[state.stageId]!;
  for (const b of stage.blocks) {
    const x = b.left / ONE, y = b.top / ONE, bw = (b.right - b.left) / ONE, bh = (b.bottom - b.top) / ONE;
    ctx.fillStyle = '#4a3b2f';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + bw, y);
    ctx.lineTo(x + bw - 40, y + bh);
    ctx.lineTo(x + 40, y + bh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6fbf73';
    ctx.fillRect(x, y, bw, 10);
    ctx.strokeStyle = '#1a1420';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (const p of stage.platforms) {
    const x = p.left / ONE, y = p.top / ONE, pw = (p.right - p.left) / ONE;
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(x, y, pw, 8);
    ctx.strokeStyle = '#1a1420';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, pw, 8);
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, state: MatchState, f: FighterState, slot: number, color: string): void {
  if (f.action === Action.KO || f.action === Action.Out) return;
  const st = FIGHTERS[f.charId]!.stats;
  const look = lookOf(f.charId);
  const tag = slotColor(slot);
  const intangible = isIntangible(f, st);

  let x = f.x / ONE;
  const y = f.y / ONE;
  // Hitlag / shieldstun shake (derived from state, never written back).
  if (f.hitlag > 0 && (f.action === Action.Hitstun || f.action === Action.ShieldStun)) x += state.frame & 1 ? 3 : -3;

  drawSwipes(ctx, f, color);

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
  if (charging > 0) {
    // Pulsing glow that grows with charge.
    const pulse = 0.25 + 0.25 * Math.sin(performance.now() * 0.025);
    ctx.fillStyle = `rgba(255,240,170,${(pulse * (0.4 + charging)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y - st.height / ONE / 2, st.height / ONE / 2 + 6 * charging, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.action === Action.Hitstun && f.actionFrame < 6) {
    ctx.fillStyle = 'rgba(255,60,60,0.3)';
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
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#11131f';
  ctx.strokeText(`P${slot + 1}`, x, ty);
  ctx.fillStyle = tag;
  ctx.fillText(`P${slot + 1}`, x, ty);
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
      ctx.fillStyle = color;
      ctx.strokeStyle = '#11131f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + dir * 12, y);
      ctx.lineTo(x - dir * 8, y - 5);
      ctx.lineTo(x - dir * 4, y);
      ctx.lineTo(x - dir * 8, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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

/** Translucent swipe over each active hitbox, so attacks read without the debug view. */
function drawSwipes(ctx: CanvasRenderingContext2D, f: FighterState, color: string): void {
  for (const b of activeHitboxes(f)) {
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
