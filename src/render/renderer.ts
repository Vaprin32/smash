import { Action } from '../sim/actions';
import { activeHitboxes, isIntangible } from '../sim/combat';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import type { FighterState, MatchState } from '../sim/state';
import type { Camera } from './camera';

/** Per player slot. */
export const SLOT_COLORS = ['#5ad1e6', '#f08a4b'];

export function slotColor(slot: number): string {
  return SLOT_COLORS[slot % SLOT_COLORS.length]!;
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
  state.fighters.forEach((f, i) => drawFighter(ctx, state, f, i));
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

function drawFighter(ctx: CanvasRenderingContext2D, state: MatchState, f: FighterState, slot: number): void {
  if (f.action === Action.KO || f.action === Action.Out) return;
  const st = FIGHTERS[f.charId]!.stats;
  const color = slotColor(slot);
  const intangible = isIntangible(f, st);

  let x = f.x / ONE;
  const y = f.y / ONE;
  // Hitlag shake on the victim (derived from state, never written back).
  if (f.hitlag > 0 && f.action === Action.Hitstun) x += state.frame & 1 ? 3 : -3;

  let sx = 1, sy = 1;
  if (f.action === Action.JumpSquat || (f.action === Action.Landing && f.actionFrame < 2)) {
    sx = 1.15;
    sy = 0.82;
  } else if (f.ground < 0 && f.vy < -3 * ONE && f.action !== Action.Hitstun) {
    sx = 0.9;
    sy = 1.1;
  } else if (f.action === Action.SpotDodge) {
    sx = 1.1;
    sy = 0.75;
  }
  const w = (st.width / ONE) * sx;
  const h = (st.height / ONE) * sy;

  // Limb reaching toward the move's hitboxes, then the swipe itself.
  drawAttack(ctx, f, x, y, h, color);

  ctx.save();
  if (f.invincible > 0 && (state.frame >> 2) & 1) ctx.globalAlpha = 0.45;
  if (intangible && f.invincible === 0) ctx.globalAlpha = 0.5;
  if (f.action === Action.SpecialFall) ctx.globalAlpha = 0.75;

  ctx.translate(x, y - h / 2);
  const speed = Math.abs(f.vx) + Math.abs(f.vy);
  if (f.action === Action.Hitstun && f.ground < 0 && speed > 8 * ONE) {
    ctx.rotate(f.actionFrame * 0.35 * -f.facing);
  }

  ctx.fillStyle = f.action === Action.SpecialFall ? '#7c8592' : color;
  ctx.strokeStyle = intangible ? '#ffffff' : '#11131f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 10);
  ctx.fill();
  ctx.stroke();
  if (f.action === Action.Hitstun && f.actionFrame < 6) {
    ctx.fillStyle = 'rgba(255,60,60,0.45)';
    ctx.fill();
  }

  // Facing indicator: a visor on the facing side plus a small nose.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(f.facing * w * 0.18 - 6, -h * 0.28, 12, 8);
  ctx.fillStyle = '#11131f';
  ctx.beginPath();
  ctx.moveTo((f.facing * w) / 2, -h * 0.1);
  ctx.lineTo(f.facing * (w / 2 + 9), -h * 0.02);
  ctx.lineTo((f.facing * w) / 2, h * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (f.action === Action.Respawn) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - 40, y, 80, 5);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`P${slot + 1}`, x, y - h - 10);
}

function drawAttack(ctx: CanvasRenderingContext2D, f: FighterState, x: number, y: number, h: number, color: string): void {
  if (f.action !== Action.Attack) return;
  const move = FIGHTERS[f.charId]!.moves[f.move]!;
  const first = move.hitboxes[0];
  if (!first) return;
  const lastEnd = Math.max(...move.hitboxes.map((b) => b.end));
  if (f.actionFrame > lastEnd) return;

  const active = activeHitboxes(f);
  const target = active[0] ?? first;
  const tx = x + (f.facing * target.x) / ONE;
  const ty = y + target.y / ONE;
  // Wind-up: the limb grows toward the hitbox during startup.
  const t = active.length > 0 ? 1 : Math.min(1, f.actionFrame / first.start);
  const cx = x, cy = y - h / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = active.length > 0 ? 10 : 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + (tx - cx) * t, cy + (ty - cy) * t);
  ctx.stroke();

  for (const b of active) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + (f.facing * b.x) / ONE, y + b.y / ONE, b.r / ONE, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
