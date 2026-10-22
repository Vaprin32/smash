// Position integration and stage collision. Fighters collide as an axis-aligned
// box whose origin is the bottom-center (feet). Standing / landing uses the feet point.

import { Action, setAction } from './actions';
import type { FighterStats } from './fighters/types';
import { surfaceOf, type Block, type StageDef } from './stage';
import type { FighterState } from './state';

export function moveFighter(f: FighterState, st: FighterStats, stage: StageDef): void {
  const hw = st.width >> 1;

  if (f.ground >= 0) {
    f.x += f.vx;
    resolveWallsX(f, hw, st.height, stage);
    const s = surfaceOf(stage, f.ground);
    if (f.x >= s.left && f.x <= s.right) {
      f.y = s.top;
      f.vy = 0;
      return;
    }
    // Walked off the edge.
    f.ground = -1;
    f.vy = 0;
    f.hopOpen = 0;
    setAction(f, Action.Air);
    return;
  }

  const prevY = f.y;
  f.x += f.vx;
  resolveWallsX(f, hw, st.height, stage);
  f.y += f.vy;

  for (let i = 0; i < stage.blocks.length; i++) {
    const b = stage.blocks[i]!;
    if (!overlaps(f, hw, st.height, b)) continue;
    if (f.vy >= 0 && prevY <= b.top && f.x >= b.left && f.x <= b.right) {
      land(f, i, b.top, st);
    } else if (f.vy < 0 && prevY - st.height >= b.bottom) {
      f.y = b.bottom + st.height;
      f.vy = 0;
    } else {
      // Clipped a corner with the feet outside the block: push out sideways.
      f.x = f.x < (b.left + b.right) >> 1 ? b.left - hw : b.right + hw;
    }
  }
  if (f.ground >= 0) return;

  // Blocks' tops landed via overlap above; catch exact contact (feet exactly on top).
  for (let i = 0; i < stage.blocks.length; i++) {
    const b = stage.blocks[i]!;
    if (f.vy >= 0 && prevY <= b.top && f.y >= b.top && f.x >= b.left && f.x <= b.right) {
      land(f, i, b.top, st);
      return;
    }
  }

  if (f.vy < 0 || f.dropTimer > 0) return;
  const nb = stage.blocks.length;
  for (let i = 0; i < stage.platforms.length; i++) {
    const p = stage.platforms[i]!;
    if (prevY <= p.top && f.y >= p.top && f.x >= p.left && f.x <= p.right) {
      land(f, nb + i, p.top, st);
      return;
    }
  }
}

export function outsideBlastZone(f: FighterState, stage: StageDef): boolean {
  const z = stage.blast;
  return f.x < z.left || f.x > z.right || f.y < z.top || f.y > z.bottom;
}

function overlaps(f: FighterState, hw: number, h: number, b: Block): boolean {
  return f.x + hw > b.left && f.x - hw < b.right && f.y > b.top && f.y - h < b.bottom;
}

function resolveWallsX(f: FighterState, hw: number, h: number, stage: StageDef): void {
  for (const b of stage.blocks) {
    if (!overlaps(f, hw, h, b)) continue;
    if (f.vx > 0) f.x = b.left - hw;
    else if (f.vx < 0) f.x = b.right + hw;
    else f.x = f.x < (b.left + b.right) >> 1 ? b.left - hw : b.right + hw;
    f.vx = 0;
  }
}

function land(f: FighterState, ground: number, top: number, st: FighterStats): void {
  f.y = top;
  f.vy = 0;
  f.ground = ground;
  f.jumpsLeft = st.airJumps;
  f.fastFall = 0;
  f.hopOpen = 0;
  f.dropTimer = 0;
  setAction(f, st.landingLag > 0 ? Action.Landing : Action.Idle);
}
