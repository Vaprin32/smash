// Render-only camera. Lives entirely outside sim state and uses floats freely.

import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import type { MatchState } from '../sim/state';

const PADDING = 120; // world px around the framed area
const MIN_VIEW_HEIGHT = 380; // most zoomed in
/** Always keep this much of the middle of the stage in view (world px either side of x = 0), for context. */
const STAGE_ANCHOR = 110;
const MAX_VIEW_HEIGHT = 1500; // most zoomed out
const SMOOTHING = 0.12;

export class Camera {
  x = 0;
  y = -120;
  /** Screen pixels per world pixel. */
  zoom = 1;
  /** Screen-space shake offset in CSS pixels, set by the effects layer. */
  shakeX = 0;
  shakeY = 0;
  /** Extra zoom for a moment after a strong hit (0 = none), set by the effects layer. */
  punch = 0;
  private initialized = false;

  update(state: MatchState, viewW: number, viewH: number): void {
    // A zero-size canvas (page loaded hidden) would make zoom NaN, and smoothing would keep it NaN forever.
    if (viewW <= 0 || viewH <= 0) return;
    const stage = STAGES[state.stageId]!;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const include = (x: number, y: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };
    // Frame the fighters (close up when they're close), plus the middle of the stage.
    const top = Math.min(...stage.blocks.map((b) => b.top)) / ONE;
    include(-STAGE_ANCHOR, top);
    include(STAGE_ANCHOR, top + 40);
    for (const f of state.fighters) {
      if (f.action === Action.KO || f.action === Action.Out) continue;
      include(f.x / ONE, f.y / ONE);
      include(f.x / ONE, (f.y - FIGHTERS[f.charId]!.stats.height) / ONE - 30);
    }

    const w = maxX - minX + PADDING * 2;
    const h = maxY - minY + PADDING * 2;
    let viewHeight = Math.max(h, (w * viewH) / viewW);
    viewHeight = Math.min(MAX_VIEW_HEIGHT, Math.max(MIN_VIEW_HEIGHT, viewHeight));
    const targetZoom = viewH / viewHeight;
    const tx = (minX + maxX) / 2;
    const ty = (minY + maxY) / 2;

    if (!this.initialized) {
      this.x = tx;
      this.y = ty;
      this.zoom = targetZoom;
      this.initialized = true;
      return;
    }
    this.x += (tx - this.x) * SMOOTHING;
    this.y += (ty - this.y) * SMOOTHING;
    this.zoom += (targetZoom - this.zoom) * SMOOTHING;
  }

  /** Set the context transform so drawing uses world pixel coordinates. */
  apply(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    const z = this.zoom * (1 + this.punch);
    ctx.setTransform(z, 0, 0, z, viewW / 2 - this.x * z + this.shakeX, viewH / 2 - this.y * z + this.shakeY);
  }
}
