import { px } from '../fixed';
import { KESTREL_MOVES } from '../moves/kestrel';
import type { FighterDef } from './types';

/** Fast-falling rushdown: high gravity, quick jumps, fast attacks. Moves in moves/kestrel.ts. */
export const KESTREL: FighterDef = {
  name: 'Kestrel',
  moves: KESTREL_MOVES,
  stats: {
    width: px(34),
    height: px(62),

    walkSpeed: px(3.4),
    runSpeed: px(7.6),
    runDelay: 7,
    groundAccel: px(1),
    groundFriction: px(0.8),
    dashSpeed: px(12),
    dashFrames: 9,
    dashCooldown: 16,

    jumpSquat: 3,
    fullHopSpeed: px(12.4),
    shortHopSpeed: px(7.6),
    shortHopWindow: 3,
    doubleJumpSpeed: px(11.6),
    airJumps: 1,

    gravity: px(0.62),
    maxFallSpeed: px(9),
    fastFallSpeed: px(13.5),
    airMaxSpeed: px(4.2),
    airAccel: px(0.42),
    airFriction: px(0.07),

    landingLag: 3,
    specialFallLanding: 14,
    dropThroughFrames: 8,

    weight: 95,

    rollFrames: 20,
    rollSpeed: px(7.5),
    rollMoveFrames: 12,
    rollIntangible: [3, 14],
    spotDodgeFrames: 18,
    spotDodgeIntangible: [2, 14],
    airDodgeFrames: 22,
    airDodgeIntangible: [2, 14],
    airDodgeSpeed: px(8.5),
    airDodgeDecay: px(0.7),
  },
};
