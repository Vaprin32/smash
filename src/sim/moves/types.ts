import { px } from '../fixed';

/** Move slots. Every fighter's moveset is an array indexed by these. */
export const MoveId = {
  Jab: 0,
  FTilt: 1,
  DTilt: 2,
  NAir: 3,
  FAir: 4,
  DAir: 5,
  UAir: 6,
  SideSpecial: 7,
  UpSpecial: 8,
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
  /** Launch angle in degrees: 0 = forward, 90 = up, 270 = down. */
  angle: number;
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
}): HitboxDef {
  return {
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
}
