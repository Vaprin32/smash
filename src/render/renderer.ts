import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import type { FighterState, MatchState } from '../sim/state';
import type { Camera } from './camera';

export const FIGHTER_COLORS = ['#5ad1e6', '#f08a4b'];

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
  // Blink while invincible (derived from state, never written back).
  if (f.invincible > 0 && (state.frame >> 2) & 1) ctx.globalAlpha = 0.45;

  let sx = 1, sy = 1;
  if (f.action === Action.JumpSquat || (f.action === Action.Landing && f.actionFrame < 2)) {
    sx = 1.15;
    sy = 0.82;
  } else if (f.ground < 0 && f.vy < -3 * ONE) {
    sx = 0.9;
    sy = 1.1;
  }
  const w = (st.width / ONE) * sx;
  const h = (st.height / ONE) * sy;
  const x = f.x / ONE, y = f.y / ONE;

  ctx.fillStyle = FIGHTER_COLORS[f.charId % FIGHTER_COLORS.length]!;
  ctx.strokeStyle = '#11131f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // Facing indicator: a visor on the facing side plus a small nose.
  const eyeX = x + f.facing * w * 0.18;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(eyeX - 6, y - h * 0.78, 12, 8);
  ctx.fillStyle = '#11131f';
  ctx.beginPath();
  ctx.moveTo(x + (f.facing * w) / 2, y - h * 0.6);
  ctx.lineTo(x + f.facing * (w / 2 + 9), y - h * 0.52);
  ctx.lineTo(x + (f.facing * w) / 2, y - h * 0.44);
  ctx.closePath();
  ctx.fill();

  if (f.action === Action.Respawn) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - 40, y, 80, 5);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`P${slot + 1}`, x, y - h - 10);
}
