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
  /** Frames platforms are ignored after dropping through one. */
  dropThroughFrames: number;
}

export interface FighterDef {
  name: string;
  stats: FighterStats;
}
