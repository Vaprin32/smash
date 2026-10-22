// A local match: countdown, fixed-step simulation, pause menu, and the
// "GAME!" pause before the results screen. Everything here only reads sim
// state; the sim only ever sees one input bitmask per player per frame,
// and every frame is recorded so the match can be watched again.

import { Btn } from '../sim/input';
import { MATCH_ON, matchWinner } from '../sim/outcome';
import { newReplay, recordStep, type Replay } from '../sim/replay';
import { DEFAULT_STOCKS } from '../sim/rules';
import { createMatch, type MatchSetup, type MatchState } from '../sim/state';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawMenu, panel, text, type View } from './draw';
import { MatchView } from './matchView';
import { MenuList } from './menuModel';
import type { MatchResult } from './results';

/** 3, 2, 1 — one number per this many ticks. */
const COUNT_STEP = 40;
const COUNTDOWN = COUNT_STEP * 3;
const GO_TICKS = 45;
/** How long "GAME!" shows before the results. */
const END_TICKS = 150;
const DIRECTIONS = Btn.Left | Btn.Right | Btn.Up | Btn.Down;
const PAUSE_ITEMS = ['Resume', 'Restart', 'Character select', 'Main menu'];

export class MatchScreen implements Screen {
  private state!: MatchState;
  private replay?: Replay;
  private view!: MatchView;
  private countdown = 0;
  private sinceStart = 0;
  private endTicks = -1;
  private paused = false;
  private pauseMenu = new MenuList(PAUSE_ITEMS.length);
  /** Buttons held when play (re)starts are ignored until released. */
  private blocked = [0, 0];
  private damageDealt = [0, 0];

  constructor(
    private app: App,
    readonly mode: Mode,
    readonly chars: readonly number[],
  ) {
    this.restart();
  }

  private restart(): void {
    this.keepReplay();
    const setup: MatchSetup = { seed: (Math.random() * 0x100000000) >>> 0, stageId: 0, chars: this.chars, stocks: DEFAULT_STOCKS };
    this.state = createMatch(setup);
    this.replay = newReplay(setup);
    this.view = new MatchView(this.app);
    this.countdown = COUNTDOWN;
    this.sinceStart = 0;
    this.endTicks = -1;
    this.damageDealt = [0, 0];
    this.blockHeld();
  }

  /** Make this match the one "Watch replay" shows, unless it never got past the countdown. */
  private keepReplay(): void {
    if (this.replay && this.replay.inputs.length > 0) this.app.lastMatch = { mode: this.mode, replay: this.replay };
  }

  /** Ignore the action buttons that are held right now until they're let go. */
  private blockHeld(): void {
    this.blocked = this.blocked.map((_, slot) => this.app.controls.input(slot) & ~DIRECTIONS);
  }

  private gated(slot: number): number {
    const held = this.app.controls.input(slot);
    this.blocked[slot] &= held;
    return held & ~this.blocked[slot];
  }

  tick(): void {
    const c = this.app.controls;
    const sfx = this.app.sfx;

    if (this.paused) {
      this.tickPause();
      return;
    }
    if (this.endTicks >= 0) {
      if (++this.endTicks >= END_TICKS) this.finish();
      return;
    }
    if (c.backKey || c.startButton) {
      this.paused = true;
      this.pauseMenu.index = 0;
      sfx.select();
      return;
    }
    if (this.mode === 'training' && c.resetKey) {
      this.restart();
      this.countdown = 0;
      return;
    }
    if (this.countdown > 0) {
      if (this.countdown % COUNT_STEP === 0) sfx.select();
      this.countdown--;
      if (this.countdown === 0) sfx.go();
      this.blockHeld();
      return;
    }

    const inputs = [this.gated(0), this.mode === 'training' ? 0 : this.gated(1)];
    const prev = this.state;
    this.state = recordStep(this.replay!, prev, inputs);
    this.view.onStep(prev, this.state);
    this.sinceStart++;
    // 1v1: damage a fighter takes was dealt by the other one.
    this.state.fighters.forEach((f, i) => {
      const taken = f.damage - prev.fighters[i]!.damage;
      if (taken > 0) this.damageDealt[1 - i] += taken;
    });
    if (matchWinner(this.state) !== MATCH_ON) this.endTicks = 0;
  }

  private tickPause(): void {
    const c = this.app.controls;
    const sfx = this.app.sfx;
    if (c.backKey || c.startButton) {
      this.resume();
      return;
    }
    const event = this.pauseMenu.update([c.menu(0), c.menu(1)], c.confirmKey, false);
    if (event === 'move') sfx.move();
    if (event === 'back') this.resume();
    if (event !== 'choose') return;
    sfx.select();
    switch (this.pauseMenu.index) {
      case 0:
        this.resume();
        break;
      case 1:
        this.paused = false;
        this.restart();
        break;
      case 2:
        this.keepReplay();
        this.app.toCharSelect(this.mode, this.chars);
        break;
      default:
        this.keepReplay();
        this.app.toMainMenu();
    }
  }

  private resume(): void {
    this.paused = false;
    this.app.sfx.back();
    this.blockHeld();
  }

  private finish(): void {
    this.keepReplay();
    const result: MatchResult = {
      mode: this.mode,
      chars: [...this.chars],
      winner: matchWinner(this.state),
      stocksLeft: this.state.fighters.map((f) => f.stocks),
      falls: this.state.fighters.map((f) => DEFAULT_STOCKS - f.stocks),
      damageDealt: [...this.damageDealt],
      seconds: Math.floor(this.state.frame / 60),
    };
    this.app.toResults(result);
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    const training = this.mode === 'training';
    this.view.draw(ctx, view, dtMs, this.state, {
      labels: training ? ['', 'CPU'] : [],
      hint: training ? 'Training · R reset · Esc pause · F1 debug' : 'Esc / Menu: pause · F1 debug',
    });
    this.drawOverlay(ctx, view);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, view: View): void {
    const W = 1100, H = 720;
    beginLayout(ctx, view, W, H);
    const big = { size: 110, bold: true, align: 'center' as const, outline: true };
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown / COUNT_STEP);
      const k = (this.countdown % COUNT_STEP) / COUNT_STEP;
      ctx.globalAlpha = 0.4 + 0.6 * k;
      text(ctx, String(n), W / 2, H / 2 - 40, { ...big, color: '#ffd166' });
      ctx.globalAlpha = 1;
    } else if (this.sinceStart < GO_TICKS && this.endTicks < 0) {
      ctx.globalAlpha = 1 - this.sinceStart / GO_TICKS;
      text(ctx, 'GO!', W / 2, H / 2 - 40, { ...big, color: '#7dff9a' });
      ctx.globalAlpha = 1;
    }
    if (this.endTicks >= 0) {
      text(ctx, 'GAME!', W / 2, H / 2 - 40, { ...big, color: '#ffffff' });
    }
    if (this.paused) {
      panel(ctx, W / 2 - 200, 170, 400, 330);
      text(ctx, 'Paused', W / 2, 225, { size: 34, bold: true, align: 'center', color: '#ffd166' });
      drawMenu(ctx, PAUSE_ITEMS, this.pauseMenu.index, W / 2, 255, 300);
      text(ctx, 'Esc / Menu / Special: resume', W / 2, 480, { size: 13, align: 'center', color: 'rgba(255,255,255,0.6)' });
    }
  }
}
