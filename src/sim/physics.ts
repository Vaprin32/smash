// Position integration and stage collision. Fighters collide as an axis-aligned
// box whose origin is the bottom-center (feet). Standing / landing uses the feet point.

import { Action, isGroundFree, setAction } from './actions';
import type { FighterDef } from './fighters/types';
import { Btn } from './input';
import { KNOCKDOWN_HITSTUN } from './rules';
import { surfaceOf, type Block, type StageDef } from './stage';
import type { FighterState } from './state';

/** `input` is the fighter's held buttons: holding down while falling passes through platforms. */
export function moveFighter(f: FighterState, def: FighterDef, stage: StageDef, input: number): void {
  const st = def.stats;
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
    // Walked off the edge. Attacks, dodges and hitstun carry on in the air.
    f.ground = -1;
    f.vy = 0;
    f.hopOpen = 0;
    if (isGroundFree(f.action)) setAction(f, Action.Air);
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
      land(f, i, b.top, def);
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
      land(f, i, b.top, def);
      return;
    }
  }

  if (f.vy < 0 || f.dropTimer > 0 || fallsThrough(f, input)) return;
  const nb = stage.blocks.length;
  for (let i = 0; i < stage.platforms.length; i++) {
    const p = stage.platforms[i]!;
    if (prevY <= p.top && f.y >= p.top && f.x >= p.left && f.x <= p.right) {
      land(f, nb + i, p.top, def);
      return;
    }
  }
}

/** Holding down while falling skips pass-through platforms (not while launched in hitstun). */
function fallsThrough(f: FighterState, input: number): boolean {
  return (input & Btn.Down) !== 0 && f.action !== Action.Hitstun;
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

function land(f: FighterState, ground: number, top: number, def: FighterDef): void {
  const st = def.stats;
  f.y = top;
  f.vy = 0;
  f.ground = ground;
  f.jumpsLeft = st.airJumps;
  f.fastFall = 0;
  f.hopOpen = 0;
  f.dropTimer = 0;
  f.airDodgeUsed = 0;
  f.oncePerAirUsed = 0;
  f.ledgeGrabs = 0;

  switch (f.action) {
    case Action.Hitstun:
      f.hitstun = Math.min(f.hitstun, KNOCKDOWN_HITSTUN);
      return;
    case Action.Roll:
    case Action.SpotDodge:
    case Action.ShieldBreak:
      return;
    case Action.Attack:
      startLanding(f, def.moves[f.move]!.landingLag ?? st.landingLag);
      return;
    case Action.SpecialFall:
      startLanding(f, st.specialFallLanding);
      return;
    default:
      startLanding(f, st.landingLag);
  }
}

function startLanding(f: FighterState, lag: number): void {
  if (lag > 0) {
    setAction(f, Action.Landing);
    f.landLag = lag;
  } else {
    setAction(f, Action.Idle);
  }
}
