import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import type { MatchState } from '../sim/state';
import { FIGHTER_COLORS } from './renderer';

/** `scale` is device pixels per CSS pixel, so text stays readable on high-DPI screens. */
export function drawHud(ctx: CanvasRenderingContext2D, state: MatchState, viewW: number, viewH: number, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const w = viewW / scale, h = viewH / scale;
  const n = state.fighters.length;
  state.fighters.forEach((f, i) => {
    const cx = (w * (i + 1)) / (n + 1);
    const cy = h - 70;
    const color = FIGHTER_COLORS[f.charId % FIGHTER_COLORS.length]!;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(`${f.damage}%`, cx, cy);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`P${i + 1} ${FIGHTERS[f.charId]!.name}`, cx, cy + 22);
    for (let s = 0; s < f.stocks; s++) {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#11131f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + (s - (f.stocks - 1) / 2) * 20, cy + 40, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (f.action === Action.Out) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText('Out of stocks — press R to restart', w / 2, h / 2);
    }
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('A/D move · L or Space jump · S fast-fall / drop through · F1 debug · R reset', 12, h - 12);
}
