import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import type { MatchState } from '../sim/state';
import { fighterColor, lookOf, slotColor } from './renderer';

/** White at 0%, through yellow and orange, to deep red at 150%+. */
function damageColor(damage: number): string {
  const t = Math.min(1, damage / 150);
  const g = Math.round(255 * (1 - t * 0.85));
  const b = Math.round(255 * Math.max(0, 1 - t * 2.5));
  return `rgb(255,${g},${b})`;
}

const PANEL_W = 190;
const PANEL_H = 84;

/**
 * One panel per player along the bottom: name, damage % and stock icons.
 * `scale` is device pixels per CSS pixel, so text stays readable on high-DPI
 * screens. `labels` adds a note after a player's name (e.g. "CPU").
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  viewW: number,
  viewH: number,
  scale: number,
  labels: readonly string[],
  hint = '',
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const w = viewW / scale, h = viewH / scale;
  const n = state.fighters.length;
  const chars = state.fighters.map((f) => f.charId);

  state.fighters.forEach((f, i) => {
    const cx = (w * (i + 1)) / (n + 1);
    const x = cx - PANEL_W / 2;
    const y = h - PANEL_H - 22;
    const out = f.action === Action.Out;

    ctx.globalAlpha = out ? 0.45 : 1;
    ctx.fillStyle = 'rgba(10,12,28,0.72)';
    roundRect(ctx, x, y, PANEL_W, PANEL_H, 10);
    ctx.fill();
    ctx.fillStyle = slotColor(i);
    roundRect(ctx, x, y, 8, PANEL_H, 4);
    ctx.fill();

    // Portrait: the fighter's head in their colors.
    const look = lookOf(f.charId);
    const px = x + 42, py = y + 36;
    ctx.fillStyle = fighterColor(chars, i);
    ctx.beginPath();
    ctx.arc(px, py, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.strokeStyle = '#11131f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py + 2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = look.accessory === 'helmet' ? look.accent : look.hair;
    ctx.beginPath();
    ctx.arc(px, py + 2, 12, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const tag = `P${i + 1}${labels[i] ? ` ${labels[i]}` : ''}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = slotColor(i);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(tag, x + 74, y + 20);
    const tagW = ctx.measureText(tag).width;
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(FIGHTERS[f.charId]!.name, x + 74 + tagW + 7, y + 20);

    ctx.fillStyle = damageColor(f.damage);
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText(`${f.damage}%`, x + 74, y + 54);

    for (let s = 0; s < f.stocks; s++) {
      ctx.fillStyle = fighterColor(chars, i);
      ctx.strokeStyle = '#11131f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 80 + s * 18, y + 70, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  if (hint) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(hint, 12, h - 8);
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
