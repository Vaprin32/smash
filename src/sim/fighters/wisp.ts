import { px } from '../fixed';
import { WISP_MOVES } from '../moves/wisp';
import type { FighterDef } from './types';

/** Fast, light and floaty. All of Wisp's tuning lives here; moves in moves/wisp.ts. */
export const WISP: FighterDef = {
  name: 'Wisp',
  moves: WISP_MOVES,
  stats: {
    width: px(36),
    height: px(60),

    walkSpeed: px(3.2),
    runSpeed: px(6.4),
    runDelay: 8,
    groundAccel: px(0.8),
    groundFriction: px(0.6),

    jumpSquat: 4,
    fullHopSpeed: px(9.6),
    shortHopSpeed: px(6.2),
    shortHopWindow: 3,
    doubleJumpSpeed: px(9.2),
    airJumps: 1,

    gravity: px(0.36),
    maxFallSpeed: px(6.2),
    fastFallSpeed: px(9.5),
    airMaxSpeed: px(4.0),
    airAccel: px(0.38),
    airFriction: px(0.06),

    landingLag: 3,
    specialFallLanding: 12,
    dropThroughFrames: 10,

    weight: 85,

    rollFrames: 20,
    rollSpeed: px(7),
    rollMoveFrames: 12,
    rollIntangible: [3, 14],
    spotDodgeFrames: 18,
    spotDodgeIntangible: [2, 14],
    airDodgeFrames: 22,
    airDodgeIntangible: [2, 14],
    airDodgeSpeed: px(8),
    airDodgeDecay: px(0.6),
  },
};
