// Graphics options: quality (auto / high / medium / low), screen shake and
// an FPS counter. Saved in this browser; render-only, so they never affect
// the simulation (or an online opponent).

import { currentLevel, settings, updateSettings, type QualityChoice } from '../render/quality';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, panel, roundRect, text, type View } from './draw';

const W = 1100;
const H = 720;
const QUALITIES: readonly QualityChoice[] = ['auto', 'high', 'medium', 'low'];
const QUALITY_NOTES: Record<QualityChoice, string> = {
  auto: 'Starts at High and steps down by itself if the game can’t keep 60 fps',
  high: 'Full resolution, every light, particle, trail and layer of mist',
  medium: 'Lower resolution on sharp screens, half the particles',
  low: 'For slower computers: lower resolution, no mist, lights or trails',
};

interface Row {
  label: string;
  value: () => string;
  note: () => string;
  change: (dir: number) => void;
}

export class GraphicsScreen implements Screen {
  private row = 0;
  private rows: Row[];

  constructor(private app: App) {
    this.rows = [
      {
        label: 'Quality',
        value: () => (settings.quality === 'auto' ? `Auto (now ${cap(currentLevel())})` : cap(settings.quality)),
        note: () => QUALITY_NOTES[settings.quality],
        change: (dir) => {
          const i = QUALITIES.indexOf(settings.quality);
          updateSettings({ quality: QUALITIES[(i + dir + QUALITIES.length) % QUALITIES.length]! });
          window.dispatchEvent(new Event('resize')); // the canvas resolution follows the quality
        },
      },
      {
        label: 'Screen shake',
        value: () => (settings.screenShake ? 'On' : 'Off'),
        note: () => 'The camera shakes on strong hits and KOs',
        change: () => updateSettings({ screenShake: !settings.screenShake }),
      },
      {
        label: 'Show FPS',
        value: () => (settings.showFps ? 'On' : 'Off'),
        note: () => 'Frames per second in the top-right corner',
        change: () => updateSettings({ showFps: !settings.showFps }),
      },
    ];
  }

  tick(): void {
    const c = this.app.controls;
    const m = c.menu(0);
    if (c.backKey || m.back) {
      this.app.sfx.back();
      return this.app.toMainMenu('Graphics');
    }
    const count = this.rows.length + 1;
    if (m.up || m.down) {
      this.row = (this.row + (m.down ? 1 : -1) + count) % count;
      this.app.sfx.move();
    }
    const onBack = this.row === this.rows.length;
    if ((m.left || m.right) && !onBack) {
      this.rows[this.row]!.change(m.right ? 1 : -1);
      this.app.sfx.move();
    }
    if (m.confirm || c.confirmKey || c.startButton) {
      this.app.sfx.select();
      if (onBack) return this.app.toMainMenu('Graphics');
      this.rows[this.row]!.change(1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    text(ctx, 'Graphics', W / 2, 80, { size: 42, bold: true, align: 'center', color: '#ffd166', outline: true });
    panel(ctx, W / 2 - 360, 120, 720, 70 + this.rows.length * 86);
    this.rows.forEach((row, i) => {
      const y = 150 + i * 86;
      const on = i === this.row;
      if (on) {
        roundRect(ctx, W / 2 - 340, y - 8, 680, 74, 8);
        ctx.fillStyle = 'rgba(255,209,102,0.18)';
        ctx.fill();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, row.label, W / 2 - 310, y + 30, { size: 22, bold: true });
      text(ctx, `◀  ${row.value()}  ▶`, W / 2 + 310, y + 30, { size: 22, bold: true, align: 'right', color: on ? '#ffd166' : '#ffffff' });
      text(ctx, row.note(), W / 2 - 310, y + 54, { size: 14, color: '#d9c49a' });
    });
    const by = 150 + this.rows.length * 86 + 40;
    const onBack = this.row === this.rows.length;
    roundRect(ctx, W / 2 - 110, by, 220, 44, 8);
    ctx.fillStyle = onBack ? '#e9b44c' : 'rgba(40,26,14,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#b8862b';
    ctx.stroke();
    text(ctx, 'Back', W / 2, by + 29, { size: 19, bold: true, align: 'center', color: onBack ? '#2a1a0c' : '#f1e4c8' });
    text(ctx, 'Up / down: choose · left / right: change · Esc: back · saved in this browser', W / 2, 690, {
      size: 15,
      align: 'center',
      color: 'rgba(255,255,255,0.65)',
    });
  }
}

function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1);
}
