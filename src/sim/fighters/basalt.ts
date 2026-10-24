import { px } from '../fixed';
import { BASALT_MOVES } from '../moves/basalt';
import type { FighterDef } from './types';

/** Giant super-heavyweight: the biggest, slowest and hardest to launch. Moves in moves/basalt.ts. */
export const BASALT: FighterDef = {
  name: 'Basalt',
  moves: BASALT_MOVES,
  stats: {
    width: px(56),
    height: px(88),

    walkSpeed: px(2),
    runSpeed: px(4.4),
    runDelay: 6,
    groundAccel: px(0.7),
    groundFriction: px(1),
    dashSpeed: px(7.2),
    dashFrames: 12,
    dashCooldown: 24,

    jumpSquat: 5,
    fullHopSpeed: px(11),
    shortHopSpeed: px(7),
    shortHopWindow: 3,
    doubleJumpSpeed: px(9.6),
    airJumps: 1,

    gravity: px(0.5),
    maxFallSpeed: px(8.4),
    fastFallSpeed: px(12),
    airMaxSpeed: px(2.6),
    airAccel: px(0.3),
    airFriction: px(0.05),

    landingLag: 4,
    specialFallLanding: 24,
    dropThroughFrames: 12,

    weight: 140,

    rollFrames: 30,
    rollSpeed: px(5.5),
    rollMoveFrames: 16,
    rollIntangible: [4, 18],
    spotDodgeFrames: 24,
    spotDodgeIntangible: [3, 18],
    airDodgeFrames: 30,
    airDodgeIntangible: [3, 18],
    airDodgeSpeed: px(6.5),
    airDodgeDecay: px(0.45),
  },
};
