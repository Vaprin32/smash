// Draws a match: world, hit effects, camera, HUD and the F1 debug overlay.
// Shared by live matches, replays and the netcode test. It only ever reads
// sim state.

import type { Sfx } from '../audio/sfx';
import { Camera } from '../render/camera';
import { drawDebugText, drawDebugWorld } from '../render/debug';
import { Effects } from '../render/effects';
import { drawHud } from '../render/hud';
import { drawForeground } from '../render/scenery';
import { drawWorld } from '../render/renderer';
import type { MatchState } from '../sim/state';
import type { App } from './app';
import type { View } from './draw';

export interface HudText {
  /** Note after each player's name (e.g. "CPU"). */
  labels: readonly string[];
  /** Key hints in the bottom-left corner. */
  hint: string;
}

export class MatchView {
  private camera = new Camera();
  private effects: Effects;
  private renderFrames = 0;
  private simFrames = 0;
  private fps = { renderFps: 0, simFps: 0 };
  private fpsWindowStart = performance.now();

  /** `sfx`: where hit sounds go (a never-unlocked Sfx is silent). */
  constructor(
    private app: App,
    sfx: Sfx = app.sfx,
  ) {
    // Effects dedupe by frame number, so each match (or replay run) gets a fresh one.
    this.effects = new Effects(sfx);
  }

  /**
   * Call once per simulated frame, with the state before and after it. After
   * a rollback, re-simulated frames come again (`resim`): effects already
   * shown are skipped, ones the rollback revealed play late.
   */
  onStep(prev: MatchState, next: MatchState, resim = false): void {
    this.effects.onStep(prev, next);
    if (!resim) this.simFrames++;
  }

  /** `debugLines` are extra lines for the F1 overlay. */
  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number, state: MatchState, hud: HudText, debugLines: readonly string[] = []): void {
    const { w, h, dpr } = view;
    this.effects.update(dtMs);
    this.camera.shakeX = this.effects.shakeX * dpr;
    this.camera.shakeY = this.effects.shakeY * dpr;
    this.camera.punch = this.effects.punch;
    this.camera.update(state, w, h);
    drawWorld(ctx, state, this.camera, w, h, hud.labels);
    this.effects.draw(ctx);
    drawForeground(ctx, this.camera, w, h, performance.now());
    this.effects.drawScreen(ctx, w, h);
    const debug = this.app.debug;
    if (debug) drawDebugWorld(ctx, state, this.camera, w, h);
    drawHud(ctx, state, w, h, dpr, hud.labels, hud.hint);
    if (debug) drawDebugText(ctx, state, { ...this.fps, lines: debugLines }, dpr);

    this.renderFrames++;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = { renderFps: this.renderFrames, simFps: this.simFrames };
      this.renderFrames = this.simFrames = 0;
      this.fpsWindowStart = now;
    }
  }
}
