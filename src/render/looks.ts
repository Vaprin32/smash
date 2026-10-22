import type { Look } from './skeleton';

/** Body proportions and colors per fighter (indexed by charId). Outfit color comes from the player slot. */
export const LOOKS: readonly Look[] = [
  {
    // Wisp: slim and long-limbed, with a trailing scarf.
    thigh: 14,
    shin: 14,
    torso: 19,
    upperArm: 12,
    forearm: 12,
    headR: 7.5,
    neck: 2.5,
    limbW: 6,
    torsoW: 12,
    skin: '#f2d2b6',
    hair: '#f4f1ea',
    accent: '#e8c547',
  },
];
