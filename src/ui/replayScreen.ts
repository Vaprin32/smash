// Watch the last match again: its recorded inputs re-simulated from its
// recorded setup. Pause, step frame by frame (both ways), slow down or speed up.

import { clamp } from '../sim/fixed';
import { MATCH_ON, matchWinner } from '../sim/outcome';
import { ReplayPlayer } from '../sim/replay';
import type { App, LastMatch, Screen } from './app';
import { beginLayout, roundRect, text, type View } from './draw';
import { MatchView } from './matchView';

/** Playback speeds, in quarter frames per tick (¼×, ½×, 1×, 2×, 4×). */
const SPEEDS = [1, 2, 4, 8, 16];
const SPEED_LABELS = ['¼×', '½×', '1×', '2×', '4×'];
const NORMAL_SPEED = 2;
const W = 1100;
const H = 720;

function clock(frames: number): string {
  const secs = Math.floor(frames / 60);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export class ReplayScreen implements Screen {
  private player!: ReplayPlayer;
  private view!: MatchView;
  private speed = NORMAL_SPEED;
  private paused = false;
  /** Quarter frames owed to the sim at the current speed. */
  private owed = 0;

  constructor(
    private app: App,
    readonly match: LastMatch,
    private exit: () => void,
  ) {
    this.restart();
  }

  private restart(): void {
    this.player = new ReplayPlayer(this.match.replay);
    this.view = new MatchView(this.app);
    this.paused = false;
    this.owed = 0;
  }

  /** Move to `frame`, feeding the frames played forward to the effects. */
  private goTo(frame: number): void {
    if (frame < this.player.state.frame) {
      this.player.seek(frame); // effects for those frames already played
      return;
    }
    while (this.player.state.frame < frame && !this.player.done) {
      const prev = this.player.state;
      this.view.onStep(prev, this.player.step());
    }
  }

  tick(): void {
    const c = this.app.controls;
    const sfx = this.app.sfx;
    const presses = [c.menu(0), c.menu(1)];
    const any = (k: 'left' | 'right' | 'confirm' | 'back') => presses.some((p) => p[k]);

    if (c.backKey || any('back')) {
      sfx.back();
      this.exit();
      return;
    }
    if (c.resetKey) {
      sfx.select();
      this.restart();
      return;
    }
    if (c.confirmKey || c.startButton || any('confirm')) {
      sfx.select();
      if (this.player.done) this.restart();
      else this.paused = !this.paused;
    }
    const dir = (any('right') ? 1 : 0) - (any('left') ? 1 : 0);
    if (dir !== 0) {
      sfx.move();
      const frame = this.player.state.frame;
      if (this.paused) this.goTo(frame + dir);
      else this.speed = clamp(this.speed + dir, 0, SPEEDS.length - 1);
    }

    if (this.paused || this.player.done) return;
    this.owed += SPEEDS[this.speed]!;
    const whole = Math.floor(this.owed / 4);
    this.owed -= whole * 4;
    this.goTo(this.player.state.frame + whole);
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    const p = this.player;
    const desync = p.desyncFrame >= 0 ? `DESYNC at frame ${p.desyncFrame}` : 'ok';
    this.view.draw(
      ctx,
      view,
      dtMs,
      p.state,
      {
        labels: this.match.mode === 'training' ? ['', 'CPU'] : [],
        hint: 'Replay · J / Space pause · A / D speed, or step when paused · R restart · Esc back · F1 debug',
      },
      [`replay frame ${p.state.frame} / ${p.length}   speed ${SPEED_LABELS[this.speed]}   checksums ${desync}`],
    );
    this.drawOverlay(ctx, view);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, view: View): void {
    const area = beginLayout(ctx, view, W, H);
    const p = this.player;

    // Top-right bar (clear of the F1 panel): label, time, speed and progress.
    const barW = 420, barX = area.left + area.width - barW - 16, barY = area.top + 16;
    ctx.fillStyle = 'rgba(10,12,28,0.72)';
    roundRect(ctx, barX, barY, barW, 52, 10);
    ctx.fill();
    text(ctx, 'REPLAY', barX + 16, barY + 24, { size: 16, bold: true, color: '#ff6b6b' });
    const status = p.done ? 'END' : this.paused ? 'PAUSED' : SPEED_LABELS[this.speed]!;
    text(ctx, `${clock(p.state.frame)} / ${clock(p.length)}`, barX + barW / 2, barY + 24, { size: 16, bold: true, align: 'center' });
    text(ctx, status, barX + barW - 16, barY + 24, { size: 16, bold: true, align: 'right', color: '#ffd166' });
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX + 16, barY + 36, barW - 32, 5);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(barX + 16, barY + 36, ((barW - 32) * p.state.frame) / Math.max(1, p.length), 5);

    if (p.done) {
      const big = { size: 110, bold: true, align: 'center' as const, outline: true, color: '#ffffff' };
      text(ctx, matchWinner(p.state) === MATCH_ON ? 'END' : 'GAME!', W / 2, H / 2 - 40, big);
      text(ctx, 'J / Enter: watch again · Esc: back', W / 2, H / 2 + 10, { size: 18, align: 'center', outline: true });
    }
    if (p.desyncFrame >= 0) {
      text(ctx, `REPLAY DESYNC at frame ${p.desyncFrame}`, W / 2, 110, {
        size: 30,
        bold: true,
        align: 'center',
        color: '#ff4f4f',
        outline: true,
      });
    }
  }
}
