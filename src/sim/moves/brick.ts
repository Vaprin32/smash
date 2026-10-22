import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Brick: Wisp's normals, slower and much stronger, plus a brawler's specials.
export const BRICK_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 125, size: 120, reach: 100, damage: 150, knockback: 125 },
  {
    [MoveId.NSpecial]: {
      name: 'Haymaker',
      total: 52,
      landingLag: 14,
      impulses: [{ frame: 15, vx: px(3) }],
      hitboxes: [hitbox({ frames: [18, 21], x: 44, y: -44, r: 24, damage: 20, kb: 7, growth: 16, angle: 40 })],
    },
    [MoveId.SideSpecial]: {
      name: 'Bull Rush',
      total: 44,
      landingLag: 14,
      noDrift: true,
      oncePerAir: true,
      noGravity: [8, 20],
      impulses: [
        { frame: 8, vx: px(9), airVy: px(-1) },
        { frame: 21, vx: px(2) },
      ],
      hitboxes: [hitbox({ frames: [9, 20], x: 28, y: -40, r: 26, damage: 13, kb: 6, growth: 12, angle: 40 })],
    },
    [MoveId.UpSpecial]: {
      name: 'Rocket Fist',
      total: 42,
      landingLag: 16,
      helplessAfter: true,
      impulses: [{ frame: 6, vx: px(1.5), vy: px(-13.5) }],
      hitboxes: [hitbox({ frames: [6, 14], x: 14, y: -70, r: 24, damage: 10, kb: 6, growth: 9, angle: 80 })],
    },
    [MoveId.DownSpecial]: {
      // Hops, hangs, then drops straight down; a stomp on the ground.
      name: 'Ground Pound',
      total: 50,
      landingLag: 18,
      noDrift: true,
      noGravity: [1, 26],
      impulses: [
        { frame: 1, airVy: px(-2) },
        { frame: 12, airVy: px(12) },
      ],
      hitboxes: [hitbox({ frames: [12, 26], x: 0, y: -10, r: 30, damage: 14, kb: 6, growth: 11, angle: 80 })],
    },
  },
);
