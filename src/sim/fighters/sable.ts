import { px } from '../fixed';
import { SABLE_MOVES } from '../moves/sable';
import type { FighterDef } from './types';

/** Long-reach swordfighter: tall, average speed, outranges everyone up close. Moves in moves/sable.ts. */
export const SABLE: FighterDef = {
  name: 'Sable',
  moves: SABLE_MOVES,
  stats: {
    width: px(34),
    height: px(70),

    walkSpeed: px(3),
    runSpeed: px(6.2),
    runDelay: 8,
    groundAccel: px(0.7),
    groundFriction: px(0.6),
    dashSpeed: px(10),
    dashFrames: 10,
    dashCooldown: 18,

    jumpSquat: 4,
    fullHopSpeed: px(10.2),
    shortHopSpeed: px(6.4),
    shortHopWindow: 3,
    doubleJumpSpeed: px(9.6),
    airJumps: 1,

    gravity: px(0.42),
    maxFallSpeed: px(7),
    fastFallSpeed: px(10.4),
    airMaxSpeed: px(3.4),
    airAccel: px(0.32),
    airFriction: px(0.06),

    landingLag: 4,
    specialFallLanding: 16,
    dropThroughFrames: 10,

    weight: 96,

    rollFrames: 22,
    rollSpeed: px(7),
    rollMoveFrames: 13,
    rollIntangible: [3, 15],
    spotDodgeFrames: 19,
    spotDodgeIntangible: [2, 15],
    airDodgeFrames: 24,
    airDodgeIntangible: [2, 15],
    airDodgeSpeed: px(8),
    airDodgeDecay: px(0.6),
  },
};
