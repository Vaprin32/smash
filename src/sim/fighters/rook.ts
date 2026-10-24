import { px } from '../fixed';
import { ROOK_MOVES } from '../moves/rook';
import type { FighterDef } from './types';

/** All-rounder: middle of the pack in everything, with a counter. Moves in moves/rook.ts. */
export const ROOK: FighterDef = {
  name: 'Rook',
  moves: ROOK_MOVES,
  stats: {
    width: px(38),
    height: px(64),

    walkSpeed: px(3),
    runSpeed: px(6.4),
    runDelay: 4,
    groundAccel: px(1.2),
    groundFriction: px(0.9),
    dashSpeed: px(10.5),
    dashFrames: 10,
    dashCooldown: 16,

    jumpSquat: 3,
    fullHopSpeed: px(10.6),
    shortHopSpeed: px(6.6),
    shortHopWindow: 3,
    doubleJumpSpeed: px(10),
    airJumps: 1,

    gravity: px(0.44),
    maxFallSpeed: px(7.2),
    fastFallSpeed: px(10.8),
    airMaxSpeed: px(3.6),
    airAccel: px(0.5),
    airFriction: px(0.06),

    landingLag: 2,
    specialFallLanding: 14,
    dropThroughFrames: 10,

    weight: 100,

    rollFrames: 21,
    rollSpeed: px(7),
    rollMoveFrames: 12,
    rollIntangible: [3, 14],
    spotDodgeFrames: 18,
    spotDodgeIntangible: [2, 14],
    airDodgeFrames: 23,
    airDodgeIntangible: [2, 14],
    airDodgeSpeed: px(8),
    airDodgeDecay: px(0.6),
  },
};
