// Ledges, Ultimate-style. A fighter falling (or recovering) past a stage
// corner grabs it and hangs there; the first grab since touching the ground
// is briefly intangible, and grabbing restores the air jumps and once-per-air
// specials. From the ledge: climb up (up / toward the stage), jump, attack
// (a climbing sweep), roll onto the stage (shield), or let go (down / away).
// Grabbing a ledge someone already hangs from knocks them off it ("trump").

import { Action, isLedgeAction, setAction } from './actions';
import { startMove, startRoll } from './attacks';
import { idiv, px } from './fixed';
import type { FighterDef } from './fighters/types';
import { FIGHTERS } from './fighters';
import { Btn, type InputBits } from './input';
import { inputDirX } from './movement';
import { MoveId } from './moves/types';
import {
  LEDGE_ACTIONABLE,
  LEDGE_CLIMB_FRAMES,
  LEDGE_GRAB_INVINCIBILITY,
  LEDGE_MAX_HANG,
  LEDGE_REACH_DOWN,
  LEDGE_REACH_IN,
  LEDGE_REACH_OUT,
  LEDGE_REACH_UP,
  LEDGE_REGRAB_COOLDOWN,
  LEDGE_TRUMP_PUSH,
} from './rules';
import { ledgeCount, ledgeOf, type Ledge, type StageDef } from './stage';
import type { FighterState, MatchState } from './state';

/** Gap between the hanging fighter's body and the stage wall. */
const HANG_GAP = px(2);
/** Hanging, the feet are this percent of the body height below the ledge (hands at the corner). */
const HANG_DEPTH_PERCENT = 85;
/** Speed toward the stage when jumping from the ledge. */
const LEDGE_JUMP_VX = px(1.5);

/** Where a fighter hangs from `l` (feet position). */
export function hangPosition(def: FighterDef, l: Ledge): { x: number; y: number } {
  const st = def.stats;
  return { x: l.x + l.side * ((st.width >> 1) + HANG_GAP), y: l.y + idiv(st.height * HANG_DEPTH_PERCENT, 100) };
}

/** Where a fighter stands after climbing up `l`: on the stage, right at the edge. */
export function standPosition(def: FighterDef, l: Ledge): { x: number; y: number } {
  return { x: l.x - l.side * (def.stats.width >> 1), y: l.y };
}

/** Fighters that may grab a ledge this frame. */
function canGrab(f: FighterState, input: InputBits): boolean {
  if (f.ground >= 0 || f.ledgeCooldown > 0 || f.hitlag > 0 || input & Btn.Down) return false;
  switch (f.action) {
    case Action.Air:
      return f.vy >= 0;
    case Action.SpecialFall:
      return true;
    case Action.Attack:
      return f.move === MoveId.UpSpecial && f.actionFrame >= 4;
  }
  return false;
}

/** Are `f`'s hands within reach of ledge `l`? */
function inReach(f: FighterState, def: FighterDef, l: Ledge): boolean {
  const st = def.stats;
  const out = (f.x - l.x) * l.side; // > 0: outside the stage
  const head = f.y - st.height - l.y; // > 0: head below the corner
  return out >= -LEDGE_REACH_IN && out <= (st.width >> 1) + LEDGE_REACH_OUT && head >= -LEDGE_REACH_UP && head <= LEDGE_REACH_DOWN;
}

/** After everyone moved: grab ledges in reach (in player order, so it's deterministic). */
export function grabLedges(s: MatchState, stage: StageDef, inputs: readonly InputBits[]): void {
  const n = ledgeCount(stage);
  s.fighters.forEach((f, i) => {
    if (!canGrab(f, (inputs[i] ?? 0) | 0)) return;
    const def = FIGHTERS[f.charId]!;
    for (let li = 0; li < n; li++) {
      const l = ledgeOf(stage, li);
      if (!inReach(f, def, l)) continue;
      const holder = s.fighters.find((o) => o !== f && isLedgeAction(o.action) && o.ledge === li);
      // A ledge someone is climbing, or grabbed this very frame, is taken.
      if (holder && (holder.action !== Action.LedgeHang || holder.actionFrame === 0)) continue;
      if (holder) trump(holder, l);
      grab(f, def, li, l);
      return;
    }
  });
}

function grab(f: FighterState, def: FighterDef, index: number, l: Ledge): void {
  const st = def.stats;
  setAction(f, Action.LedgeHang);
  f.ledge = index;
  const p = hangPosition(def, l);
  f.x = p.x;
  f.y = p.y;
  f.vx = 0;
  f.vy = 0;
  f.facing = -l.side;
  f.fastFall = 0;
  f.hopOpen = 0;
  f.jumpsLeft = st.airJumps;
  f.airDodgeUsed = 0;
  f.oncePerAirUsed = 0;
  f.ledgeGrabs++;
  if (f.ledgeGrabs === 1) f.invincible = Math.max(f.invincible, LEDGE_GRAB_INVINCIBILITY);
}

/** Knocked off the ledge by someone else grabbing it. */
function trump(f: FighterState, l: Ledge): void {
  letGo(f);
  f.vx = l.side * LEDGE_TRUMP_PUSH;
  f.invincible = 0;
}

function letGo(f: FighterState): void {
  setAction(f, Action.Air);
  f.ledge = -1;
  f.ledgeCooldown = LEDGE_REGRAB_COOLDOWN;
  f.vx = 0;
  f.vy = 0;
}

/** One frame hanging: wait, or take a ledge option. */
export function updateLedgeHang(f: FighterState, pressed: number, def: FighterDef, stage: StageDef): void {
  const l = ledgeOf(stage, f.ledge);
  const p = hangPosition(def, l);
  f.x = p.x;
  f.y = p.y;
  f.actionFrame++;
  if (f.actionFrame >= LEDGE_MAX_HANG) return letGo(f);
  if (f.actionFrame < LEDGE_ACTIONABLE) return;

  const toward = -l.side;
  const dirX = inputDirX(pressed);
  if (f.jumpBuffer > 0) {
    f.jumpBuffer = 0;
    letGo(f);
    f.vy = -def.stats.fullHopSpeed;
    f.vx = toward * LEDGE_JUMP_VX;
    return;
  }
  if (f.actBufferTimer > 0) {
    const btn = f.actBuffer;
    f.actBuffer = 0;
    f.actBufferTimer = 0;
    if (btn === Btn.Dodge) return climb(f, Action.LedgeClimbRoll);
    if (btn === Btn.Attack || btn === Btn.Heavy || btn === Btn.Special) return climb(f, Action.LedgeClimbAttack);
  }
  if (pressed & Btn.Up || dirX === toward) return climb(f, Action.LedgeClimb);
  if (pressed & Btn.Down || dirX === -toward) letGo(f);
}

function climb(f: FighterState, action: typeof Action.LedgeClimb | typeof Action.LedgeClimbAttack | typeof Action.LedgeClimbRoll): void {
  const ledge = f.ledge;
  setAction(f, action);
  f.ledge = ledge;
  f.invincible = Math.max(f.invincible, LEDGE_CLIMB_FRAMES + 2);
}

/** One frame of climbing: move from the hanging spot onto the stage, then stand, attack or roll. */
export function updateLedgeClimb(f: FighterState, def: FighterDef, stage: StageDef): void {
  const l = ledgeOf(stage, f.ledge);
  const from = hangPosition(def, l);
  const to = standPosition(def, l);
  f.actionFrame++;
  const t = f.actionFrame;
  if (t < LEDGE_CLIMB_FRAMES) {
    f.x = from.x + idiv((to.x - from.x) * t, LEDGE_CLIMB_FRAMES);
    f.y = from.y + idiv((to.y - from.y) * t, LEDGE_CLIMB_FRAMES);
    return;
  }
  const then = f.action;
  f.x = to.x;
  f.y = to.y;
  f.vx = 0;
  f.vy = 0;
  f.ground = l.block;
  f.ledge = -1;
  f.ledgeGrabs = 0;
  const toward = -l.side;
  if (then === Action.LedgeClimbAttack) startMove(f, MoveId.LedgeAttack, toward);
  else if (then === Action.LedgeClimbRoll) startRoll(f, toward, def);
  else setAction(f, Action.Idle);
}
