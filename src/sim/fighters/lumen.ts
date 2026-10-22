import { px } from '../fixed';
import { LUMEN_MOVES } from '../moves/lumen';
import type { FighterDef } from './types';

/** Floaty long-range zoner: slow on the ground, hangs in the air. Moves in moves/lumen.ts. */
export const LUMEN: FighterDef = {
  name: 'Lumen',
  moves: LUMEN_MOVES,
  stats: {
    width: px(32),
    height: px(68),

    walkSpeed: px(2.8),
    runSpeed: px(5.8),
    runDelay: 9,
    groundAccel: px(0.6),
    groundFriction: px(0.5),
    dashSpeed: px(9),
    dashFrames: 10,
    dashCooldown: 18,

    jumpSquat: 5,
    fullHopSpeed: px(8.8),
    shortHopSpeed: px(5.6),
    shortHopWindow: 3,
    doubleJumpSpeed: px(8.8),
    airJumps: 1,

    gravity: px(0.27),
    maxFallSpeed: px(5),
    fastFallSpeed: px(8),
    airMaxSpeed: px(3.6),
    airAccel: px(0.3),
    airFriction: px(0.05),

    landingLag: 4,
    specialFallLanding: 14,
    dropThroughFrames: 10,

    weight: 82,

    rollFrames: 22,
    rollSpeed: px(6.5),
    rollMoveFrames: 13,
    rollIntangible: [3, 15],
    spotDodgeFrames: 20,
    spotDodgeIntangible: [2, 15],
    airDodgeFrames: 24,
    airDodgeIntangible: [2, 16],
    airDodgeSpeed: px(7.5),
    airDodgeDecay: px(0.5),
  },
};
