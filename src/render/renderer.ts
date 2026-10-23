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
import { banner, SERIF, THEME } from './theme';

/** Per player slot: name tags, cursors, shields. Fighters wear their own colors. */
export const SLOT_COLORS = ['#d8453b', '#3f7fdc'];

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
  const t = performance.now();
  drawSky(ctx, cam, w, h);
  cam.apply(ctx, w, h);
  drawStage(ctx, state, t);
  const chars = state.fighters.map((f) => f.charId);
  state.fighters.forEach((f, i) => drawFighter(ctx, state, f, i, fighterColor(chars, i)));
  state.fighters.forEach((f, i) => drawProjectile(ctx, f, fighterColor(chars, i)));
}

/** Castle on the horizon, in its own units: [x, width, height] per keep or tower. */
const FAR_CASTLE: [number, number, number][] = [
  [-260, 90, 120], [-185, 34, 190], [-150, 300, 95], [-40, 40, 230], [10, 70, 160], [150, 34, 200], [184, 110, 110],
];

/** Sunset sky, hills and a far castle, shifted a little with the camera (parallax). Screen space. */
function drawSky(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#171a3c');
  sky.addColorStop(0.55, '#55304f');
  sky.addColorStop(1, '#c4703c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 720;
  ctx.fillStyle = 'rgba(255,236,200,0.85)';
  ctx.beginPath();
  ctx.arc(w * 0.78 - cam.x * cam.zoom * 0.03, h * 0.2, 30 * s, 0, Math.PI * 2);
  ctx.fill();

  const z = cam.zoom;
  const layer = (depth: number, color: string, draw: () => void) => {
    // depth 0 = at infinity (doesn't move), 1 = moves with the stage.
    ctx.setTransform(z * (0.5 + depth * 0.5), 0, 0, z * (0.5 + depth * 0.5), w / 2 - cam.x * z * depth, h / 2 + (160 - cam.y * depth) * z * 0.6);
    ctx.fillStyle = color;
    draw();
  };
  layer(0.15, '#3a2238', () => {
    ctx.beginPath();
    ctx.moveTo(-3000, 4000);
    for (let x = -3000; x <= 3000; x += 150) ctx.lineTo(x, 30 - Math.abs(Math.sin(x * 0.0021) * 110) - (x % 300 === 0 ? 30 : 0));
    ctx.lineTo(3000, 4000);
    ctx.fill();
  });
  layer(0.25, '#26172a', () => {
    for (const [x, cw, ch] of FAR_CASTLE) {
      ctx.fillRect(x, -ch + 40, cw, ch + 4000);
      for (let mx = x; mx < x + cw - 6; mx += 16) ctx.fillRect(mx, -ch + 30, 8, 10);
    }
    ctx.fillStyle = 'rgba(255,180,90,0.7)';
    for (const [x, cw, ch] of FAR_CASTLE) if (cw < 50) ctx.fillRect(x + cw / 2 - 3, -ch + 70, 6, 12);
  });
  layer(0.4, '#1d1420', () => {
    ctx.beginPath();
    ctx.moveTo(-3000, 4000);
    for (let x = -3000; x <= 3000; x += 120) ctx.lineTo(x, 120 - Math.abs(Math.cos(x * 0.0017)) * 70);
    ctx.lineTo(3000, 4000);
    ctx.fill();
  });
}

const STONE_LIGHT = '#8d867c';
const STONE = '#6f6a64';
const STONE_DARK = '#4d4843';
const MORTAR = '#2e2a27';

function drawStage(ctx: CanvasRenderingContext2D, state: MatchState, timeMs: number): void {
  const stage = STAGES[state.stageId]!;
  for (const b of stage.blocks) {
    const x = b.left / ONE, y = b.top / ONE, bw = (b.right - b.left) / ONE, bh = (b.bottom - b.top) / ONE;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + bw, y);
      ctx.lineTo(x + bw - 40, y + bh);
      ctx.lineTo(x + 40, y + bh);
      ctx.closePath();
    };
    // Rampart: courses of stone blocks with staggered joints.
    ctx.save();
    outline();
    const wall = ctx.createLinearGradient(0, y, 0, y + bh);
    wall.addColorStop(0, STONE);
    wall.addColorStop(1, STONE_DARK);
    ctx.fillStyle = wall;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = MORTAR;
    ctx.lineWidth = 1.5;
    for (let row = 0, cy = y + 12; cy < y + bh; row++, cy += 15) {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + bw, cy);
      for (let jx = x + (row % 2 ? 14 : 0); jx < x + bw; jx += 28) {
        ctx.moveTo(jx, cy);
        ctx.lineTo(jx, cy + 15);
      }
      ctx.stroke();
    }
    ctx.restore();
    // Flagstone walkway with a mossy lip.
    ctx.fillStyle = STONE_LIGHT;
    ctx.fillRect(x, y, bw, 9);
    ctx.fillStyle = '#5f8a4a';
    for (let mx = x + 6; mx < x + bw - 6; mx += 37) ctx.fillRect(mx, y, 14 + (mx % 11), 3);
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = 3;
    outline();
    ctx.stroke();

    // Heraldic banners in the players' colors, and torches at the ends.
    banner(ctx, x + bw * 0.28 - 14, y + 13, 28, bh - 26, slotColor(0), timeMs, 0);
    banner(ctx, x + bw * 0.72 - 14, y + 13, 28, bh - 26, slotColor(1), timeMs, 2);
    for (const tx of [x + 70, x + bw - 70]) drawTorch(ctx, tx, y + 26, timeMs);
  }
  for (const p of stage.platforms) {
    const x = p.left / ONE, y = p.top / ONE, pw = (p.right - p.left) / ONE;
    // Iron brackets below, then planks with seams and bolts.
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = 3;
    for (const bx of [x + 18, x + pw - 18]) {
      ctx.beginPath();
      ctx.moveTo(bx, y + 9);
      ctx.lineTo(bx + (bx < x + pw / 2 ? 10 : -10), y + 24);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(x, y, pw, 9);
    ctx.fillStyle = '#a8743f';
    ctx.fillRect(x, y, pw, 3);
    ctx.strokeStyle = '#3a2414';
    ctx.lineWidth = 1.5;
    for (let sx = x + 32; sx < x + pw - 8; sx += 32) {
      ctx.beginPath();
      ctx.moveTo(sx, y + 1);
      ctx.lineTo(sx, y + 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#c8c0b0';
    for (let sx = x + 6; sx < x + pw; sx += 32) ctx.fillRect(sx, y + 4, 2, 2);
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, pw, 9);
  }
}

/** Wall sconce with a flickering flame. */
function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number): void {
  ctx.fillStyle = '#2b2018';
  ctx.fillRect(x - 3, y, 6, 16);
  ctx.fillRect(x - 6, y, 12, 4);
  const flick = 1 + Math.sin(timeMs * 0.02 + x) * 0.12 + Math.sin(timeMs * 0.047 + x * 2) * 0.08;
  const glow = ctx.createRadialGradient(x, y - 6, 1, x, y - 6, 34 * flick);
  glow.addColorStop(0, 'rgba(255,190,90,0.45)');
  glow.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 6, 34 * flick, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.quadraticCurveTo(x - 6, y - 10 * flick, x, y - 17 * flick);
  ctx.quadraticCurveTo(x + 6, y - 10 * flick, x + 5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 2.2, 5 * flick, 0, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.font = `bold 15px ${SERIF}`;
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
