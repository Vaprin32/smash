import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import type { MatchState } from '../sim/state';
import { slotColor } from './renderer';

/** White at 0%, through yellow and orange, to deep red at 150%+. */
function damageColor(damage: number): string {
  const t = Math.min(1, damage / 150);
  const g = Math.round(255 * (1 - t * 0.85));
  const b = Math.round(255 * Math.max(0, 1 - t * 2.5));
  return `rgb(255,${g},${b})`;
}

/** `scale` is device pixels per CSS pixel, so text stays readable on high-DPI screens. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  viewW: number,
  viewH: number,
  scale: number,
  labels: readonly string[],
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const w = viewW / scale, h = viewH / scale;
  const n = state.fighters.length;
  state.fighters.forEach((f, i) => {
    const cx = (w * (i + 1)) / (n + 1);
    const cy = h - 70;
    ctx.textAlign = 'center';
    ctx.fillStyle = damageColor(f.damage);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(`${f.damage}%`, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`P${i + 1} ${FIGHTERS[f.charId]!.name}${labels[i] ? ` (${labels[i]})` : ''}`, cx, cy + 22);
    for (let s = 0; s < f.stocks; s++) {
      ctx.fillStyle = slotColor(i);
      ctx.strokeStyle = '#11131f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + (s - (f.stocks - 1) / 2) * 20, cy + 40, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  const out = state.fighters.findIndex((f) => f.action === Action.Out);
  if (out >= 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText(`P${out + 1} is out of stocks — press R to restart`, w / 2, h / 2);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(
    'A/D move · L/Space jump · N dash · J attack · K smash (hold to charge; special in air) · I special · ; shield (+J grab, +A/D roll, +S dodge) · F1 debug · R reset',
    12,
    h - 12,
  );
}
