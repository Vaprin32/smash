// Pieces shared by local and networked matches: the 3-2-1-GO countdown, the
// "GAME!" pause before the results, and ignoring buttons that are already
// held when play starts.

import type { Sfx } from '../audio/sfx';
import type { Controls } from '../input/controls';
import { Btn, type InputBits } from '../sim/input';
import { beginLayout, text, type View } from './draw';

/** 3, 2, 1 — one number per this many ticks. */
export const COUNT_STEP = 40;
export const COUNTDOWN = COUNT_STEP * 3;
export const GO_TICKS = 45;
/** How long "GAME!" shows before the results. */
export const END_TICKS = 150;
const DIRECTIONS = Btn.Left | Btn.Right | Btn.Up | Btn.Down;

/** One countdown tick, with its sounds. Returns the ticks left. */
export function countDown(ticksLeft: number, sfx: Sfx): number {
  if (ticksLeft % COUNT_STEP === 0) sfx.select();
  ticksLeft--;
  if (ticksLeft === 0) sfx.go();
  return ticksLeft;
}

/** Buttons held when play (re)starts are ignored until they're let go. */
export class HeldGate {
  private blocked = [0, 0];

  constructor(private controls: Controls) {}

  /** Block the action buttons held right now. */
  block(): void {
    this.blocked = this.blocked.map((_, slot) => this.controls.input(slot) & ~DIRECTIONS);
  }

  /** A player's held buttons, minus the blocked ones. */
  input(slot: number): InputBits {
    const held = this.controls.input(slot);
    this.blocked[slot]! &= held;
    return held & ~this.blocked[slot]!;
  }
}

export interface BannerState {
  /** Countdown ticks left (0: play has started). */
  countdown: number;
  /** Ticks played since the countdown ended. */
  sinceStart: number;
  ended: boolean;
}

/** The big centered "3", "2", "1", "GO!" or "GAME!". */
export function drawBanner(ctx: CanvasRenderingContext2D, view: View, b: BannerState): void {
  const W = 1100, H = 720;
  beginLayout(ctx, view, W, H);
  const big = { size: 110, bold: true, align: 'center' as const, outline: true };
  if (b.countdown > 0) {
    const n = Math.ceil(b.countdown / COUNT_STEP);
    const k = (b.countdown % COUNT_STEP) / COUNT_STEP;
    ctx.globalAlpha = 0.4 + 0.6 * k;
    text(ctx, String(n), W / 2, H / 2 - 40, { ...big, color: '#ffd166' });
    ctx.globalAlpha = 1;
  } else if (b.sinceStart < GO_TICKS && !b.ended) {
    ctx.globalAlpha = 1 - b.sinceStart / GO_TICKS;
    text(ctx, 'GO!', W / 2, H / 2 - 40, { ...big, color: '#7dff9a' });
    ctx.globalAlpha = 1;
  }
  if (b.ended) text(ctx, 'GAME!', W / 2, H / 2 - 40, { ...big, color: '#ffffff' });
}
