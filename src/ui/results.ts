import { defeatPose, idlePose, victoryPose } from '../render/animations';
import { fighterColor, slotColor } from '../render/renderer';
import { tint } from '../render/skeleton';
import { FIGHTERS } from '../sim/fighters';
import { DRAW, matchWinner } from '../sim/outcome';
import { DEFAULT_STOCKS } from '../sim/rules';
import type { MatchState } from '../sim/state';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, drawMenu, panel, text, type View } from './draw';
import { MenuList } from './menuModel';

export interface MatchResult {
  mode: Mode;
  chars: number[];
  /** Winning slot, or DRAW. */
  winner: number;
  stocksLeft: number[];
  falls: number[];
  damageDealt: number[];
  seconds: number;
}

/** The result of a match that ended in `final`. */
export function matchResult(mode: Mode, chars: readonly number[], final: MatchState, damageDealt: readonly number[]): MatchResult {
  return {
    mode,
    chars: [...chars],
    winner: matchWinner(final),
    stocksLeft: final.fighters.map((f) => f.stocks),
    falls: final.fighters.map((f) => DEFAULT_STOCKS - f.stocks),
    damageDealt: [...damageDealt],
    seconds: Math.floor(final.frame / 60),
  };
}

/** Add the damage each fighter took from `prev` to `next` to the other one's tally (1v1). */
export function tallyDamage(dealt: number[], prev: MatchState, next: MatchState): void {
  next.fighters.forEach((f, i) => {
    const taken = f.damage - prev.fighters[i]!.damage;
    if (taken > 0) dealt[1 - i]! += taken;
  });
}

const ITEMS = ['Rematch', 'Watch replay', 'Character select', 'Main menu'];
const WATCH_REPLAY = 1;
/** Ignore input briefly so buttons mashed at the end of the match don't pick an option. */
const INPUT_DELAY = 45;
const W = 1100;
const H = 720;

export class ResultsScreen implements Screen {
  private list = new MenuList(ITEMS.length);
  private frame = 0;

  /** `fromReplay`: back from watching the replay, so no input delay and the cursor stays put. */
  constructor(
    private app: App,
    readonly result: MatchResult,
    fromReplay = false,
  ) {
    if (fromReplay) {
      this.frame = INPUT_DELAY;
      this.list.index = WATCH_REPLAY;
    }
  }

  private label(slot: number): string {
    return this.result.mode === 'training' && slot === 1 ? 'CPU' : `P${slot + 1}`;
  }

  tick(): void {
    this.frame++;
    if (this.frame < INPUT_DELAY) return;
    const c = this.app.controls;
    const r = this.result;
    const event = this.list.update([c.menu(0), c.menu(1)], c.confirmKey || c.startButton, c.backKey);
    if (event === 'move') this.app.sfx.move();
    if (event === 'back') {
      this.app.sfx.back();
      this.app.toCharSelect(r.mode, r.chars);
    }
    if (event !== 'choose') return;
    this.app.sfx.select();
    if (this.list.index === 0) this.app.startMatch(r.mode, r.chars);
    else if (this.list.index === WATCH_REPLAY) this.app.watchReplay(() => this.app.toResults(r, true));
    else if (this.list.index === 2) this.app.toCharSelect(r.mode, r.chars);
    else this.app.toMainMenu();
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    beginLayout(ctx, view, W, H);
    const r = this.result;

    const title = r.winner === DRAW ? 'DRAW!' : `${this.label(r.winner)} WINS!`;
    const titleColor = r.winner === DRAW ? '#ffffff' : slotColor(r.winner);
    text(ctx, title, W / 2, 84, { size: 64, bold: true, align: 'center', color: titleColor, outline: true });
    const mins = Math.floor(r.seconds / 60);
    const secs = String(r.seconds % 60).padStart(2, '0');
    text(ctx, `Match time ${mins}:${secs}`, W / 2, 114, { size: 15, align: 'center', color: '#c9c7e8' });

    r.chars.forEach((charId, slot) => {
      const cx = slot === 0 ? 290 : 810;
      const won = slot === r.winner;
      const color = fighterColor(r.chars, slot);
      panel(ctx, cx - 210, 140, 420, 360, won ? slotColor(slot) : undefined);
      const pose = r.winner === DRAW ? idlePose(this.frame) : won ? victoryPose(this.frame) : defeatPose(this.frame);
      drawFigure(ctx, charId, color, cx - 90, 420, won ? 2.1 : 1.8, slot === 0 ? 1 : -1, pose, t, won || r.winner === DRAW ? 1 : 0.75);

      const tx = cx + 10;
      text(ctx, this.label(slot), tx, 190, { size: 18, bold: true, color: slotColor(slot) });
      text(ctx, FIGHTERS[charId]!.name, tx, 228, { size: 30, bold: true, color: tint(color, 0.35), outline: true });
      const lines = [
        `Stocks left  ${r.stocksLeft[slot]}`,
        `Falls  ${r.falls[slot]}`,
        `Damage dealt  ${r.damageDealt[slot]}%`,
      ];
      lines.forEach((l, i) => text(ctx, l, tx, 280 + i * 32, { size: 18, color: '#e8e8f4' }));
      if (won) text(ctx, '★ WINNER', tx, 400, { size: 20, bold: true, color: '#ffd166' });
    });

    if (this.frame >= INPUT_DELAY) drawMenu(ctx, ITEMS, this.list.index, W / 2, 516, 320, 48);
  }
}
