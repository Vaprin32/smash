// A local match: countdown, fixed-step simulation, pause menu, and the
// "GAME!" pause before the results screen. Everything here only reads sim
// state; the sim only ever sees one input bitmask per player per frame,
// and every frame is recorded so the match can be watched again.

import { CpuPlayer } from '../ai/cpu';
import { CPU_LEVELS } from '../ai/levels';
import { MATCH_ON, matchWinner } from '../sim/outcome';
import { newReplay, recordStep, type Replay } from '../sim/replay';
import { DEFAULT_STOCKS } from '../sim/rules';
import { createMatch, type MatchSetup, type MatchState } from '../sim/state';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawMenu, panel, text, type View } from './draw';
import { countDown, COUNTDOWN, drawBanner, END_TICKS, HeldGate } from './matchFlow';
import { MatchView } from './matchView';
import { MenuList } from './menuModel';
import { playerLabels } from './players';
import { matchResult, MatchStats } from './results';

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
  private gate: HeldGate;
  private stats!: MatchStats;
  /** Versus CPU: the computer players in slots 1, 2, ... */
  private cpus: CpuPlayer[] = [];

  constructor(
    private app: App,
    readonly mode: Mode,
    readonly chars: readonly number[],
  ) {
    this.gate = new HeldGate(app.controls);
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
    this.stats = new MatchStats(this.chars.length);
    const level = CPU_LEVELS[this.app.cpu.level]!;
    this.cpus = this.mode === 'cpu' ? this.chars.slice(1).map((_, i) => new CpuPlayer(i + 1, level, setup.seed)) : [];
    this.gate.block();
  }

  /** A human's held buttons, a CPU's decision, or nothing for the training dummy. */
  private inputFor(slot: number): number {
    if (slot === 0) return this.gate.input(slot);
    return this.cpus[slot - 1]?.think(this.state) ?? 0;
  }

  /** Make this match the one "Watch replay" shows, unless it never got past the countdown. */
  private keepReplay(): void {
    if (this.replay && this.replay.inputs.length > 0) this.app.lastMatch = { mode: this.mode, replay: this.replay };
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
      this.countdown = countDown(this.countdown, sfx);
      this.gate.block();
      return;
    }

    const inputs = this.chars.map((_, slot) => this.inputFor(slot));
    const prev = this.state;
    this.state = recordStep(this.replay!, prev, inputs);
    this.view.onStep(prev, this.state);
    this.sinceStart++;
    this.stats.onStep(prev, this.state);
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
    this.gate.block();
  }

  private finish(): void {
    this.keepReplay();
    this.app.toResults(matchResult(this.mode, this.chars, this.state, this.stats));
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    const training = this.mode === 'training';
    this.view.draw(ctx, view, dtMs, this.state, {
      labels: playerLabels(this.mode, this.chars.length),
      hint: training ? 'Training · R reset · Esc pause · F1 debug' : 'Esc / Menu: pause · F1 debug',
    });
    drawBanner(ctx, view, { countdown: this.countdown, sinceStart: this.sinceStart, ended: this.endTicks >= 0 });
    if (this.paused) this.drawPause(ctx, view);
  }

  private drawPause(ctx: CanvasRenderingContext2D, view: View): void {
    const W = 1100;
    beginLayout(ctx, view, W, 720);
    panel(ctx, W / 2 - 200, 170, 400, 330);
    text(ctx, 'Paused', W / 2, 225, { size: 34, bold: true, align: 'center', color: '#ffd166' });
    drawMenu(ctx, PAUSE_ITEMS, this.pauseMenu.index, W / 2, 255, 300);
    text(ctx, 'Esc / Menu / Special: resume', W / 2, 480, { size: 13, align: 'center', color: 'rgba(255,255,255,0.6)' });
  }
}
