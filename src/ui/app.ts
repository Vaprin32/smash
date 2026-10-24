// Screen manager: main menu -> character select -> match -> results (-> replay).
// Every screen ticks at the fixed 60 Hz rate and draws once per animation frame.

import type { Sfx } from '../audio/sfx';
import { BINDINGS } from '../input/bindings';
import type { Controls } from '../input/controls';
import { DEFAULT_CPU_LEVEL } from '../ai/levels';
import type { LostReason, OnlineLink } from '../net/online';
import type { Replay } from '../sim/replay';
import type { MatchSetup } from '../sim/state';
import { CharSelectScreen } from './charSelect';
import { ControlsScreen } from './controlsScreen';
import { GraphicsScreen } from './graphicsScreen';
import { CpuSetupScreen } from './cpuSetup';
import type { View } from './draw';
import { MainMenu } from './mainMenu';
import { MatchScreen } from './matchScreen';
import { OnlineEndScreen } from './onlineEnd';
import { OnlineLobbyScreen, type LobbyKind } from './onlineLobby';
import { OnlineMatchScreen } from './onlineMatch';
import { ReplayScreen } from './replayScreen';
import { ResultsScreen, type MatchResult } from './results';
import { StageSelectScreen } from './stageSelect';

/**
 * Versus CPU (player 1 against 1-3 computer players, everyone for
 * themselves), training (player 1 against an idle CPU dummy), or online (1v1
 * against another browser, over WebRTC).
 */
export type Mode = 'cpu' | 'training' | 'online';

/** Versus CPU settings, kept for the session. */
export interface CpuSettings {
  /** 1 to 3. */
  opponents: number;
  /** Index into CPU_LEVELS. */
  level: number;
}

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
  cpu: CpuSettings = { opponents: 1, level: DEFAULT_CPU_LEVEL };
  /** Index into STAGES picked last (kept for rematches and the next stage select). */
  stage = 0;
  /** The online room we are in, from the lobby until someone leaves. */
  online: OnlineLink | null = null;

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

  /** `select` puts the cursor on that menu item. Leaves any online room. */
  toMainMenu(select?: string): void {
    this.closeOnline();
    this.go(new MainMenu(this, select));
  }

  /** `code`: join that room right away (a join link). */
  toOnlineLobby(kind: LobbyKind, code?: string): void {
    this.go(new OnlineLobbyScreen(this, kind, code));
  }

  /** The lobby connected a room: on to character select. */
  enterOnline(link: OnlineLink): void {
    this.online = link;
    link.onLost = () => this.onlineLost(link.lost ?? 'dropped');
    this.toCharSelect('online');
  }

  /** Start (or rematch) an online match; `startDelayMs` holds back the countdown. */
  startOnlineMatch(setup: MatchSetup, match: number, startDelayMs: number): void {
    if (this.online) this.go(new OnlineMatchScreen(this, this.online, setup, match, startDelayMs));
  }

  /** We leave the room (Esc, "Leave room"). */
  leaveOnline(): void {
    this.toMainMenu();
  }

  /** The room ended without us: dropped connection, the other player left, or versions differ. */
  onlineLost(reason: LostReason): void {
    this.closeOnline();
    this.go(new OnlineEndScreen(this, reason));
  }

  private closeOnline(): void {
    const link = this.online;
    if (!link) return;
    this.online = null;
    link.onLost = () => {};
    link.leave();
  }

  toGraphics(): void {
    this.go(new GraphicsScreen(this));
  }

  toControls(): void {
    this.go(new ControlsScreen(this));
  }

  toCpuSetup(): void {
    this.go(new CpuSetupScreen(this));
  }

  /** `chars` puts the cursors back on the fighters picked last time. */
  toCharSelect(mode: Mode, chars?: readonly number[]): void {
    this.go(new CharSelectScreen(this, mode, chars));
  }

  toStageSelect(mode: Mode, chars: readonly number[]): void {
    this.go(new StageSelectScreen(this, mode, chars));
  }

  /** Start a local match on the stage picked last. */
  startMatch(mode: Mode, chars: readonly number[]): void {
    this.go(new MatchScreen(this, mode, chars));
  }

  /** `fromReplay`: coming back from watching this match's replay. */
  toResults(result: MatchResult, fromReplay = false): void {
    this.go(new ResultsScreen(this, result, fromReplay));
  }

  /** Watch `lastMatch`; `back` is where leaving the replay goes. */
  watchReplay(back: () => void): void {
    if (this.lastMatch) this.go(new ReplayScreen(this, this.lastMatch, back));
  }

  private go(screen: Screen): void {
    this.screen.leave?.();
    this.screen = screen;
    this.controls.allowPadSwap = screen instanceof CharSelectScreen;
  }
}
