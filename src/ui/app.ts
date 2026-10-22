// Screen manager: main menu -> character select -> match -> results.
// Every screen ticks at the fixed 60 Hz rate and draws once per animation frame.

import type { Sfx } from '../audio/sfx';
import { BINDINGS } from '../input/bindings';
import type { Controls } from '../input/controls';
import { CharSelectScreen } from './charSelect';
import { ControlsScreen } from './controlsScreen';
import type { View } from './draw';
import { MainMenu } from './mainMenu';
import { MatchScreen } from './matchScreen';
import { ResultsScreen, type MatchResult } from './results';

/** Local versus (two players) or training (player 1 against an idle CPU dummy). */
export type Mode = 'versus' | 'training';

export interface Screen {
  /** One fixed 60 Hz tick. Input has already been polled. */
  tick(): void;
  /** `dtMs` is real time since the last draw, for render-only animation. */
  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void;
}

export class App {
  private screen: Screen;
  /** F1 debug overlay (matches only). */
  debug = false;

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

  toMainMenu(): void {
    this.go(new MainMenu(this));
  }

  toControls(): void {
    this.go(new ControlsScreen(this));
  }

  /** `chars` puts the cursors back on the fighters picked last time. */
  toCharSelect(mode: Mode, chars?: readonly number[]): void {
    this.go(new CharSelectScreen(this, mode, chars));
  }

  startMatch(mode: Mode, chars: readonly number[]): void {
    this.go(new MatchScreen(this, mode, chars));
  }

  toResults(result: MatchResult): void {
    this.go(new ResultsScreen(this, result));
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.controls.allowPadSwap = screen instanceof CharSelectScreen;
  }
}
