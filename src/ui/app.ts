// Screen manager: main menu -> character select -> match -> results (-> replay).
// Every screen ticks at the fixed 60 Hz rate and draws once per animation frame.

import type { Sfx } from '../audio/sfx';
import { BINDINGS, type LayoutName } from '../input/bindings';
import type { Controls } from '../input/controls';
import { DEFAULT_CPU_LEVEL } from '../ai/levels';
import type { LostReason, OnlineLink } from '../net/online';
import type { Replay } from '../sim/replay';
import type { MatchSetup } from '../sim/state';
import { CharSelectScreen } from './charSelect';
import { ControlsScreen } from './controlsScreen';
import { CpuSetupScreen } from './cpuSetup';
import type { View } from './draw';
import { MainMenu } from './mainMenu';
import { MatchScreen } from './matchScreen';
import { NetTestScreen } from './netTestScreen';
import { OnlineEndScreen } from './onlineEnd';
import { OnlineLobbyScreen, type LobbyKind } from './onlineLobby';
import { OnlineMatchScreen } from './onlineMatch';
import { ReplayScreen } from './replayScreen';
import { ResultsScreen, type MatchResult } from './results';

/**
 * Local versus (two players), versus CPU (player 1 against 1-3 computer
 * players, everyone for themselves), training (player 1 against an idle CPU
 * dummy), the netcode test (two players, each on their own simulated machine),
 * or online (1v1 against another browser, over WebRTC).
 */
export type Mode = 'versus' | 'cpu' | 'training' | 'netTest' | 'online';

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
    this.go(new MainMenu(this, select), 'solo');
  }

  /** `code`: join that room right away (a join link). */
  toOnlineLobby(kind: LobbyKind, code?: string): void {
    this.go(new OnlineLobbyScreen(this, kind, code), 'solo');
  }

  /** The lobby connected a room: on to character select. */
  enterOnline(link: OnlineLink): void {
    this.online = link;
    link.onLost = () => this.onlineLost(link.lost ?? 'dropped');
    this.toCharSelect('online');
  }

  /** Start (or rematch) an online match; `startDelayMs` holds back the countdown. */
  startOnlineMatch(setup: MatchSetup, match: number, startDelayMs: number): void {
    if (this.online) this.go(new OnlineMatchScreen(this, this.online, setup, match, startDelayMs), 'solo');
  }

  /** We leave the room (Esc, "Leave room"). */
  leaveOnline(): void {
    this.toMainMenu();
  }

  /** The room ended without us: dropped connection, the other player left, or versions differ. */
  onlineLost(reason: LostReason): void {
    this.closeOnline();
    this.go(new OnlineEndScreen(this, reason), 'solo');
  }

  private closeOnline(): void {
    const link = this.online;
    if (!link) return;
    this.online = null;
    link.onLost = () => {};
    link.leave();
  }

  toControls(): void {
    this.go(new ControlsScreen(this), 'solo');
  }

  toCpuSetup(): void {
    this.go(new CpuSetupScreen(this), 'solo');
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
  return mode === 'training' || mode === 'cpu' || mode === 'online' ? 'solo' : 'versus';
}
