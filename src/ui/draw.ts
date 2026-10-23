// Canvas helpers shared by the menu screens. Screens lay themselves out in a
// fixed design space (e.g. 1100 x 720) that is scaled to fit the window.

import { lookOf } from '../render/renderer';
import { drawRig, solveRig, type Pose } from '../render/skeleton';
import { drawBackground } from '../render/scenery';
import { banner, plaque, roundRect, SERIF, THEME } from '../render/theme';

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

export const FONT = SERIF;

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
    ctx.strokeStyle = THEME.outline;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color ?? THEME.parchment;
  ctx.fillText(str, x, y);
}

/** An oak panel; `border` (e.g. a player's color) replaces the gold rim. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border?: string): void {
  plaque(ctx, x, y, w, h, border ?? THEME.goldDeep, 0.9);
  if (!border) return;
  roundRect(ctx, x, y, w, h, 8);
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();
}

const BANNER_COLORS = ['#8e2a26', '#24477f', '#2f6b3a', '#7a5a14'];

/** The game's scenery, slowly panning, with banners hanging from the top. Call before beginLayout. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, view: View, timeMs: number): void {
  const { w, h, dpr } = view;
  drawBackground(ctx, { x: Math.sin(timeMs * 0.00004) * 400, y: -40, zoom: h / 820 }, w, h, timeMs, [0.2, 0.36]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(8,6,16,0.15)');
  shade.addColorStop(1, 'rgba(8,6,16,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  const bw = 46 * dpr, bh = 150 * dpr;
  [0.04, 0.12, w > 900 * dpr ? 0.84 : -1, 0.92].forEach((fx, i) => {
    if (fx < 0) return;
    banner(ctx, fx * w, 0, bw, bh, BANNER_COLORS[i % BANNER_COLORS.length]!, timeMs, i);
  });
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

/** A vertical menu of oak plaques; the selected one is gilded. */
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
    const x = cx - width / 2, h = rowH - 10;
    if (on) {
      roundRect(ctx, x, y, width, h, 8);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#ffe39a');
      g.addColorStop(1, '#d9a441');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff3c4';
      ctx.stroke();
      // Little pointers on both sides.
      ctx.fillStyle = THEME.gold;
      for (const side of [-1, 1]) {
        const px = cx + side * (width / 2 + 10);
        ctx.beginPath();
        ctx.moveTo(px, y + h / 2);
        ctx.lineTo(px + side * 10, y + h / 2 - 7);
        ctx.lineTo(px + side * 10, y + h / 2 + 7);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      plaque(ctx, x, y, width, h);
    }
    text(ctx, item, cx, y + h / 2 + 7, { size: 21, bold: true, align: 'center', color: on ? THEME.ink : THEME.parchment });
  });
}
