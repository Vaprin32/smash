// Screen manager: main menu -> character select -> match -> results (-> replay).
// Every screen ticks at the fixed 60 Hz rate and draws once per animation frame.

import type { Sfx } from '../audio/sfx';
import { BINDINGS, type LayoutName } from '../input/bindings';
import type { Controls } from '../input/controls';
import type { Replay } from '../sim/replay';
import { CharSelectScreen } from './charSelect';
import { ControlsScreen } from './controlsScreen';
import type { View } from './draw';
import { MainMenu } from './mainMenu';
import { MatchScreen } from './matchScreen';
import { NetTestScreen } from './netTestScreen';
import { ReplayScreen } from './replayScreen';
import { ResultsScreen, type MatchResult } from './results';

/**
 * Local versus (two players), training (player 1 against an idle CPU dummy),
 * or the netcode test (two players, each on their own simulated machine).
 */
export type Mode = 'versus' | 'training' | 'netTest';

/** The most recent match played, for "Watch replay". */
export interface LastMatch {
  mode: Mode;
  replay: Replay;
}

export interface Screen {
  /** One fixed 60 Hz tick. Input has already been polled. */
  tick(): void;
  /** `dtMs` is real time since the last draw, for render-only animation. */
  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void;
  /** Called when switching to another screen (e.g. to remove DOM elements). */
  leave?(): void;
}

export class App {
  private screen: Screen;
  /** F1 debug overlay (matches only). */
  debug = false;
  lastMatch: LastMatch | null = null;

  constructor(
    readonly controls: Controls,
    readonly sfx: Sfx,
  ) {
    controls.keyboard.onPress(BINDINGS.toggleDebug, () => (this.debug = !this.debug));
    this.screen = new MainMenu(this);
  }

  tick(): void {
    this.screen.tick();
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    this.screen.draw(ctx, view, dtMs);
  }

  /** `select` puts the cursor on that menu item. */
  toMainMenu(select?: string): void {
    this.go(new MainMenu(this, select), 'solo');
  }

  toControls(): void {
    this.go(new ControlsScreen(this), 'solo');
  }

  /** `chars` puts the cursors back on the fighters picked last time. */
  toCharSelect(mode: Mode, chars?: readonly number[]): void {
    this.go(new CharSelectScreen(this, mode, chars), layoutFor(mode));
  }

  startMatch(mode: Mode, chars: readonly number[]): void {
    this.go(mode === 'netTest' ? new NetTestScreen(this, chars) : new MatchScreen(this, mode, chars), layoutFor(mode));
  }

  /** `fromReplay`: coming back from watching this match's replay. */
  toResults(result: MatchResult, fromReplay = false): void {
    this.go(new ResultsScreen(this, result, fromReplay), layoutFor(result.mode));
  }

  /** Watch `lastMatch`; `back` is where leaving the replay goes. */
  watchReplay(back: () => void): void {
    if (this.lastMatch) this.go(new ReplayScreen(this, this.lastMatch, back), 'solo');
  }

  private go(screen: Screen, layout: LayoutName): void {
    this.screen.leave?.();
    this.screen = screen;
    this.controls.setLayout(layout);
    this.controls.allowPadSwap = screen instanceof CharSelectScreen;
  }
}

/** Two-player modes split the keyboard; everything else gives P1 all of it. */
function layoutFor(mode: Mode): LayoutName {
  return mode === 'training' ? 'solo' : 'versus';
}
