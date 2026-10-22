// Canvas helpers shared by the menu screens. Screens lay themselves out in a
// fixed design space (e.g. 1100 x 720) that is scaled to fit the window.

import { roundRect } from '../render/hud';
import { lookOf } from '../render/renderer';
import { drawRig, solveRig, type Pose } from '../render/skeleton';

export { roundRect };

export interface View {
  /** Canvas size in device pixels. */
  w: number;
  h: number;
  /** Device pixels per CSS pixel. */
  dpr: number;
}

export interface Layout {
  /** Visible design-space rectangle (wider or taller than the design size, never smaller). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Scale and center a `designW` x `designH` space in the canvas and set the
 * transform so drawing uses design units. Returns the visible area.
 */
export function beginLayout(ctx: CanvasRenderingContext2D, view: View, designW: number, designH: number): Layout {
  const s = Math.min(view.w / designW, view.h / designH);
  const ox = (view.w - designW * s) / 2;
  const oy = (view.h - designH * s) / 2;
  ctx.setTransform(s, 0, 0, s, ox, oy);
  return { left: -ox / s, top: -oy / s, width: view.w / s, height: view.h / s };
}

export const FONT = 'system-ui, sans-serif';

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  /** Dark outline for text drawn over busy backgrounds. */
  outline?: boolean;
}

export function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}): void {
  ctx.font = `${o.bold ? 'bold ' : ''}${o.size ?? 16}px ${FONT}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  if (o.outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, (o.size ?? 16) / 6);
    ctx.strokeStyle = '#0b0d1c';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color ?? '#ffffff';
  ctx.fillText(str, x, y);
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border?: string): void {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = 'rgba(10,12,30,0.78)';
  ctx.fill();
  ctx.lineWidth = border ? 3 : 1.5;
  ctx.strokeStyle = border ?? 'rgba(255,255,255,0.14)';
  ctx.stroke();
}

/** Full-screen gradient with slowly drifting diagonal bands. Call before beginLayout. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, view.w * 0.3, view.h);
  g.addColorStop(0, '#171c40');
  g.addColorStop(1, '#3a2856');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  const band = 90 * view.dpr;
  const shift = ((timeMs * 0.02 * view.dpr) % (band * 2)) - band * 2;
  for (let x = shift; x < view.w + view.h; x += band * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + band, 0);
    ctx.lineTo(x + band - view.h * 0.5, view.h);
    ctx.lineTo(x - view.h * 0.5, view.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Draw a fighter standing with its feet at (x, y), `scale` design units per world px. */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  charId: number,
  color: string,
  x: number,
  y: number,
  scale: number,
  facing: number,
  pose: Pose,
  timeMs: number,
  alpha = 1,
): void {
  const look = lookOf(charId);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawRig(ctx, solveRig(pose, look, true), look, { x: 0, y: 0, facing, color, alpha, time: timeMs, vx: 0 });
  ctx.restore();
}

/** A vertical menu; the selected item is highlighted. */
export function drawMenu(
  ctx: CanvasRenderingContext2D,
  items: readonly string[],
  selected: number,
  cx: number,
  top: number,
  width = 320,
  rowH = 54,
): void {
  items.forEach((item, i) => {
    const y = top + i * rowH;
    const on = i === selected;
    roundRect(ctx, cx - width / 2, y, width, rowH - 10, 10);
    ctx.fillStyle = on ? '#ffd166' : 'rgba(10,12,30,0.7)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? '#fff3c4' : 'rgba(255,255,255,0.15)';
    ctx.stroke();
    text(ctx, item, cx, y + (rowH - 10) / 2 + 7, { size: 20, bold: true, align: 'center', color: on ? '#1b1530' : '#e8e8f4' });
  });
}
