import { px } from '../fixed';
import { PIP_MOVES } from '../moves/pip';
import type { FighterDef } from './types';

/** Tiny featherweight: very quick, three air jumps, flies far. Moves in moves/pip.ts. */
export const PIP: FighterDef = {
  name: 'Pip',
  moves: PIP_MOVES,
  stats: {
    width: px(26),
    height: px(42),

    walkSpeed: px(3.6),
    runSpeed: px(7.2),
    runDelay: 6,
    groundAccel: px(1),
    groundFriction: px(0.7),
    dashSpeed: px(11),
    dashFrames: 9,
    dashCooldown: 14,

    jumpSquat: 3,
    fullHopSpeed: px(9.2),
    shortHopSpeed: px(5.8),
    shortHopWindow: 3,
    doubleJumpSpeed: px(8),
    airJumps: 3,

    gravity: px(0.34),
    maxFallSpeed: px(5.6),
    fastFallSpeed: px(8.6),
    airMaxSpeed: px(4.4),
    airAccel: px(0.46),
    airFriction: px(0.08),

    landingLag: 2,
    specialFallLanding: 10,
    dropThroughFrames: 10,

    weight: 65,

    rollFrames: 18,
    rollSpeed: px(7),
    rollMoveFrames: 10,
    rollIntangible: [2, 12],
    spotDodgeFrames: 16,
    spotDodgeIntangible: [2, 12],
    airDodgeFrames: 20,
    airDodgeIntangible: [2, 12],
    airDodgeSpeed: px(8.5),
    airDodgeDecay: px(0.65),
  },
};
