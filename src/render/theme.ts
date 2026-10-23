// The medieval look shared by menus, HUD and stage: palette, fonts, and a few
// drawing pieces (oak plaques with gold trim, heraldic shields, banners).
// Render-only.

/** Serif faces that ship with Windows / macOS, so the single-file build needs no web fonts. */
export const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

export const THEME = {
  gold: '#ffd166',
  goldDeep: '#b8862b',
  parchment: '#f1e4c8',
  parchmentDim: '#d9c49a',
  ink: '#2a1a0c',
  oak: '#3b2616',
  oakLight: '#5a3a20',
  stone: '#6f6a64',
  stoneDark: '#45413d',
  outline: '#1a120b',
  /** Translucent oak for panels over the game. */
  plate: 'rgba(38,24,13,0.86)',
} as const;

/** Rounded-rectangle path (shared with the HUD). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** An oak board with grain lines and a gold (or given) rim, with gold rivets in the corners. */
export function plaque(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rim: string = THEME.goldDeep, alpha = 0.92): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, THEME.oakLight);
  g.addColorStop(1, THEME.oak);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = alpha * 0.18;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  for (let gy = y + 7; gy < y + h; gy += 9) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.bezierCurveTo(x + w * 0.3, gy - 3, x + w * 0.6, gy + 3, x + w, gy);
    ctx.stroke();
  }
  ctx.restore();
  roundRect(ctx, x, y, w, h, 8);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.fillStyle = THEME.gold;
  for (const [rx, ry] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Heater-shield path, `w` wide and `w * 1.15` tall, top-left at (x, y). */
export function shieldPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const h = w * 1.15;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h * 0.45);
  ctx.quadraticCurveTo(x + w, y + h * 0.85, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.45);
  ctx.closePath();
}

/** A heraldic shield in `color`, gold rimmed, with a pale band down the middle. */
export function heraldicShield(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  ctx.save();
  shieldPath(ctx, x, y, w);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x + w * 0.38, y, w * 0.24, w * 1.2);
  ctx.restore();
  shieldPath(ctx, x, y, w);
  ctx.lineWidth = Math.max(1.5, w / 10);
  ctx.strokeStyle = THEME.goldDeep;
  ctx.stroke();
}

/** A hanging cloth banner with a swallow-tail end, swaying with `timeMs`. */
export function banner(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, timeMs: number, phase = 0): void {
  const sway = Math.sin(timeMs * 0.0016 + phase) * w * 0.08;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w + sway, y + h);
  ctx.lineTo(x + w / 2 + sway, y + h * 0.82);
  ctx.lineTo(x + sway, y + h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  // Gold rod and a pale chevron.
  ctx.fillStyle = THEME.goldDeep;
  ctx.fillRect(x - 4, y - 3, w + 8, 5);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2 + sway * 0.4, y + h * 0.35);
  ctx.lineTo(x + w / 2 + sway * 0.5, y + h * 0.5);
  ctx.lineTo(x + w * 0.8 + sway * 0.4, y + h * 0.35);
  ctx.strokeStyle = 'rgba(255,240,200,0.55)';
  ctx.lineWidth = Math.max(2, w * 0.1);
  ctx.stroke();
}
