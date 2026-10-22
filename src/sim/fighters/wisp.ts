import { px } from '../fixed';
import type { FighterDef } from './types';

/** Fast, light and floaty. All of Wisp's movement tuning lives here. */
export const WISP: FighterDef = {
  name: 'Wisp',
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
    dropThroughFrames: 10,
  },
};
