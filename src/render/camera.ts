// Render-only camera. Lives entirely outside sim state and uses floats freely.

import { Action } from '../sim/actions';
import { ONE } from '../sim/fixed';
import { STAGES } from '../sim/stage';
import type { MatchState } from '../sim/state';

const PADDING = 160; // world px around the framed area
const MIN_VIEW_HEIGHT = 520; // most zoomed in
const MAX_VIEW_HEIGHT = 1500; // most zoomed out
const SMOOTHING = 0.12;

export class Camera {
  x = 0;
  y = -120;
  /** Screen pixels per world pixel. */
  zoom = 1;
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
    for (const b of stage.blocks) {
      include(b.left / ONE, b.top / ONE);
      include(b.right / ONE, b.bottom / ONE);
    }
    for (const p of stage.platforms) include(p.left / ONE, p.top / ONE);
    for (const f of state.fighters) {
      if (f.action === Action.KO || f.action === Action.Out) continue;
      include(f.x / ONE, f.y / ONE);
      include(f.x / ONE, f.y / ONE - 80);
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
    ctx.setTransform(this.zoom, 0, 0, this.zoom, viewW / 2 - this.x * this.zoom, viewH / 2 - this.y * this.zoom);
  }
}
