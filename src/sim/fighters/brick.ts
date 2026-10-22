import { px } from '../fixed';
import { BRICK_MOVES } from '../moves/brick';
import type { FighterDef } from './types';

/** Heavy, slow and hard-hitting. Moves in moves/brick.ts. */
export const BRICK: FighterDef = {
  name: 'Brick',
  moves: BRICK_MOVES,
  stats: {
    width: px(46),
    height: px(72),

    walkSpeed: px(2.4),
    runSpeed: px(5.2),
    runDelay: 10,
    groundAccel: px(0.5),
    groundFriction: px(0.7),
    dashSpeed: px(8.4),
    dashFrames: 11,
    dashCooldown: 20,

    jumpSquat: 6,
    fullHopSpeed: px(11.2),
    shortHopSpeed: px(6.8),
    shortHopWindow: 3,
    doubleJumpSpeed: px(10.2),
    airJumps: 1,

    gravity: px(0.5),
    maxFallSpeed: px(8),
    fastFallSpeed: px(11.5),
    airMaxSpeed: px(3),
    airAccel: px(0.24),
    airFriction: px(0.05),

    landingLag: 5,
    specialFallLanding: 20,
    dropThroughFrames: 10,

    weight: 120,

    rollFrames: 26,
    rollSpeed: px(6),
    rollMoveFrames: 14,
    rollIntangible: [4, 16],
    spotDodgeFrames: 22,
    spotDodgeIntangible: [3, 16],
    airDodgeFrames: 28,
    airDodgeIntangible: [3, 16],
    airDodgeSpeed: px(7),
    airDodgeDecay: px(0.5),
  },
};
