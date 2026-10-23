import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import type { MatchState } from '../sim/state';
import { fighterColor, lookOf, slotColor } from './renderer';
import { heraldicShield, plaque, SERIF, THEME } from './theme';

/** Parchment at 0%, through amber and orange, to blood red at 150%+. */
function damageColor(damage: number): string {
  const t = Math.min(1, damage / 150);
  const g = Math.round(236 * (1 - t * 0.85));
  const b = Math.round(200 * Math.max(0, 1 - t * 2.5));
  return `rgb(${Math.round(245 - t * 40)},${g},${b})`;
}

const PANEL_W = 196;
const PANEL_H = 84;

/**
 * One oak plate per player along the bottom: a heraldic shield with the
 * fighter's face, their name, damage % and stock shields. `scale` is device
 * pixels per CSS pixel, so text stays readable on high-DPI screens. `labels`
 * adds a note after a player's name (e.g. "CPU").
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
    plaque(ctx, x, y, PANEL_W, PANEL_H, slotColor(i), 0.9);

    // Portrait: the fighter's head on a shield in their colors.
    const look = lookOf(f.charId);
    const sw = 50, sx = x + 14, sy = y + 12;
    heraldicShield(ctx, sx, sy, sw, fighterColor(chars, i));
    const px = sx + sw / 2, py = sy + 27;
    ctx.fillStyle = look.skin;
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = look.accessory === 'helmet' ? look.accent : look.hair;
    ctx.beginPath();
    ctx.arc(px, py, 12, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const tag = `P${i + 1}${labels[i] ? ` ${labels[i]}` : ''}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = slotColor(i);
    ctx.font = `bold 13px ${SERIF}`;
    ctx.fillText(tag, x + 76, y + 21);
    const tagW = ctx.measureText(tag).width;
    ctx.fillStyle = THEME.parchment;
    ctx.font = `13px ${SERIF}`;
    ctx.fillText(FIGHTERS[f.charId]!.name, x + 76 + tagW + 7, y + 21);

    ctx.font = `bold 32px ${SERIF}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = THEME.outline;
    ctx.strokeText(`${f.damage}%`, x + 76, y + 55);
    ctx.fillStyle = damageColor(f.damage);
    ctx.fillText(`${f.damage}%`, x + 76, y + 55);

    for (let s = 0; s < f.stocks; s++) heraldicShield(ctx, x + 77 + s * 17, y + 62, 11, fighterColor(chars, i));
    ctx.globalAlpha = 1;
  });

  if (hint) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(241,228,200,0.6)';
    ctx.font = `13px ${SERIF}`;
    ctx.fillText(hint, 12, h - 8);
  }
}
