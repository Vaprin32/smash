import { px } from '../fixed';

/**
 * Move slots, following Smash Ultimate's moveset layout. Every fighter's
 * moveset is an array indexed by these. Append only (it's part of the state).
 */
export const MoveId = {
  Jab1: 0,
  Jab2: 1,
  Jab3: 2,
  FTilt: 3,
  UTilt: 4,
  DTilt: 5,
  DashAttack: 6,
  FSmash: 7,
  USmash: 8,
  DSmash: 9,
  NAir: 10,
  FAir: 11,
  BAir: 12,
  UAir: 13,
  DAir: 14,
  NSpecial: 15,
  SideSpecial: 16,
  UpSpecial: 17,
  DownSpecial: 18,
  /** Follow-up attack when the down special counter catches a hit. */
  CounterStrike: 19,
  Grab: 20,
  Pummel: 21,
  FThrow: 22,
  BThrow: 23,
  UThrow: 24,
  DThrow: 25,
  /** Climbing up from a ledge with the attack button. */
  LedgeAttack: 26,
  /** Drill dive (down special) touching down: the finishing hit. */
  DrillLand: 27,
} as const;

export type MoveIdValue = (typeof MoveId)[keyof typeof MoveId];

export interface HitboxDef {
  /** Active move frames, inclusive. The first frame of a move is frame 1. */
  start: number;
  end: number;
  /** Center offset from the feet, fixed point. +x is the facing direction, -y is up. */
  x: number;
  y: number;
  r: number;
  /** Percent added to the victim. */
  damage: number;
  /** Launch speed at 0%, fixed px/frame. */
  baseKb: number;
  /** Launch speed added per 100% of victim damage, fixed px/frame. */
  kbGrowth: number;
  /** Launch angle in degrees relative to the attacker's facing: 0 = forward, 90 = up, 180 = backward, 270 = down. */
  angle: number;
  /** Position and radius stay as written for every fighter (not scaled by size), e.g. to reach the platform above. */
  fixed?: boolean;
}

/** Sets velocity on a given move frame. Unset fields leave velocity unchanged. */
export interface ImpulseDef {
  frame: number;
  /** Relative to facing. */
  vx?: number;
  /** Applied always (lifts a grounded fighter off the ground if negative). */
  vy?: number;
  /** Applied only when airborne. */
  airVy?: number;
  /** Applied only when grounded (a hop that starts the move). */
  groundVy?: number;
}

export interface GrabboxDef {
  start: number;
  end: number;
  x: number;
  y: number;
  r: number;
}

export interface ProjectileDef {
  /** Move frame on which it spawns. */
  frame: number;
  /** Spawn offset from the feet (x relative to facing), fixed point. */
  x: number;
  y: number;
  /** Horizontal speed, fixed px/frame. */
  speed: number;
  /** Frames before it fizzles. */
  life: number;
  /** What it does on contact; start/end/x/y are unused. */
  hit: HitboxDef;
}

export interface MoveDef {
  name: string;
  /** Last frame of the move; the fighter is actionable again after it. */
  total: number;
  /** Checked in order; the first one touching a victim wins that frame. */
  hitboxes: readonly HitboxDef[];
  /** Landing lag if the fighter lands mid-move (aerials). */
  landingLag?: number;
  impulses?: readonly ImpulseDef[];
  /** Move frames (inclusive) during which gravity is off. */
  noGravity?: readonly [number, number];
  /** No air drift or fast-fall during the move. */
  noDrift?: boolean;
  /** Enter special fall (helpless) when the move ends in the air. */
  helplessAfter?: boolean;
  /** Specials only: usable once per airtime when started in the air. */
  oncePerAir?: boolean;
  /** Smash attack: holding the button freezes the move on this frame to charge it. */
  chargeFrame?: number;
  /** Pressing attack between move frames `from` and `to` continues into `move` (jab combo). */
  next?: { move: MoveIdValue; from: number; to: number };
  grabbox?: GrabboxDef;
  /** Pummel: deals `damage` to the held fighter on `frame`, then goes back to holding. */
  pummel?: { frame: number; damage: number };
  /** Throw: releases and launches the held fighter on `frame`. */
  throw?: { frame: number; hit: HitboxDef };
  projectile?: ProjectileDef;
  /** Counter window (inclusive move frames): getting hit then triggers CounterStrike instead. */
  counter?: readonly [number, number];
  /** Multi-hit: every this many move frames, fighters already hit can be hit again. */
  rehit?: number;
  /** From this move frame on, jump cancels the move if it hasn't hit anything yet. */
  jumpCancel?: number;
  /** Touching down during the move starts this move instead of landing lag. */
  landingMove?: MoveIdValue;
}

/** Helper so move files can be written in pixels. */
export function hitbox(h: {
  frames: [number, number];
  x: number;
  y: number;
  r: number;
  damage: number;
  kb: number;
  growth: number;
  angle: number;
  fixed?: boolean;
}): HitboxDef {
  const out: HitboxDef = {
    start: h.frames[0],
    end: h.frames[1],
    x: px(h.x),
    y: px(h.y),
    r: px(h.r),
    damage: h.damage,
    baseKb: px(h.kb),
    kbGrowth: px(h.growth),
    angle: h.angle,
  };
  if (h.fixed) out.fixed = true;
  return out;
}

/**
 * Up smash's reach through the platform overhead: a fixed-size hitbox 102-150 px
 * above the feet for every fighter, so anyone standing on the platform above gets hit.
 */
export function platformPillar(frames: [number, number], damage: number): HitboxDef {
  return hitbox({ frames, x: 0, y: -126, r: 24, damage, kb: 6, growth: 12, angle: 90, fixed: true });
}

/** Knockback-only hit (throws, projectiles) in pixel units. */
export function launch(damage: number, kb: number, growth: number, angle: number, r = 0): HitboxDef {
  return hitbox({ frames: [0, 0], x: 0, y: 0, r, damage, kb, growth, angle });
}

export function grabbox(g: { frames: [number, number]; x: number; y: number; r: number }): GrabboxDef {
  return { start: g.frames[0], end: g.frames[1], x: px(g.x), y: px(g.y), r: px(g.r) };
}
