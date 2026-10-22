import type { MoveDef } from '../moves/types';

/**
 * Every tunable movement constant for one fighter. Speeds are fixed-point
 * subpixels per frame, accelerations subpixels per frame², durations in frames.
 */
export interface FighterStats {
  /** Hurtbox / collision box size (fixed point). Origin is bottom-center (the feet). */
  width: number;
  height: number;

  walkSpeed: number;
  runSpeed: number;
  /** Frames of holding a direction while walking before breaking into a run. */
  runDelay: number;
  groundAccel: number;
  groundFriction: number;
  /** Dash button: starting speed, decaying to runSpeed over dashFrames. */
  dashSpeed: number;
  dashFrames: number;
  /** Frames from the start of a dash until the next one is allowed. */
  dashCooldown: number;

  jumpSquat: number;
  fullHopSpeed: number;
  shortHopSpeed: number;
  /**
   * Releasing jump during jump squat, or within this many airborne frames,
   * turns the jump into a short hop.
   */
  shortHopWindow: number;
  doubleJumpSpeed: number;
  airJumps: number;

  gravity: number;
  maxFallSpeed: number;
  fastFallSpeed: number;
  airMaxSpeed: number;
  airAccel: number;
  airFriction: number;

  landingLag: number;
  /** Landing lag after special fall (helpless, e.g. after the up special). */
  specialFallLanding: number;
  /** Frames platforms are ignored after dropping through one. */
  dropThroughFrames: number;

  /** Knockback is scaled by 100 / weight: lighter fighters fly further. */
  weight: number;

  rollFrames: number;
  rollSpeed: number;
  /** Frames (from 1) during which the roll moves at rollSpeed. */
  rollMoveFrames: number;
  rollIntangible: readonly [number, number];
  spotDodgeFrames: number;
  spotDodgeIntangible: readonly [number, number];
  airDodgeFrames: number;
  airDodgeIntangible: readonly [number, number];
  /** Burst speed of a directional air dodge; it decays by airDodgeDecay per frame. */
  airDodgeSpeed: number;
  airDodgeDecay: number;
}

export interface FighterDef {
  name: string;
  stats: FighterStats;
  /** Indexed by MoveId. */
  moves: readonly MoveDef[];
}
