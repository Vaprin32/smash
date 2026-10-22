// Screen manager: main menu -> character select -> match -> results.
// Every screen ticks at the fixed 60 Hz rate and draws once per animation frame.

import type { Sfx } from '../audio/sfx';
import { BINDINGS, type LayoutName } from '../input/bindings';
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
    this.go(new MainMenu(this), 'solo');
  }

  toControls(): void {
    this.go(new ControlsScreen(this), 'solo');
  }

  /** `chars` puts the cursors back on the fighters picked last time. */
  toCharSelect(mode: Mode, chars?: readonly number[]): void {
    this.go(new CharSelectScreen(this, mode, chars), layoutFor(mode));
  }

  startMatch(mode: Mode, chars: readonly number[]): void {
    this.go(new MatchScreen(this, mode, chars), layoutFor(mode));
  }

  toResults(result: MatchResult): void {
    this.go(new ResultsScreen(this, result), layoutFor(result.mode));
  }

  private go(screen: Screen, layout: LayoutName): void {
    this.screen = screen;
    this.controls.setLayout(layout);
    this.controls.allowPadSwap = screen instanceof CharSelectScreen;
  }
}

/** Local versus splits the keyboard between two players; everything else gives P1 all of it. */
function layoutFor(mode: Mode): LayoutName {
  return mode === 'versus' ? 'versus' : 'solo';
}
