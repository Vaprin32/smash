import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Brick: Wisp's normals, slower and much stronger, plus his own smashes and specials.
export const BRICK_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 125, size: 120, reach: 100, damage: 150, knockback: 125 },
  {
    // Iron Knight: slow, planted, crushing.
    [MoveId.FSmash]: {
      name: 'Gauntlet Hook',
      total: 58,
      chargeFrame: 9,
      hitboxes: [
        hitbox({ frames: [18, 21], x: 50, y: -50, r: 28, damage: 23, kb: 7.5, growth: 17, angle: 42 }),
        hitbox({ frames: [22, 24], x: 40, y: -30, r: 22, damage: 14, kb: 5, growth: 11, angle: 35 }),
      ],
    },
    [MoveId.USmash]: {
      name: 'Helm Bash',
      total: 54,
      chargeFrame: 8,
      hitboxes: [
        hitbox({ frames: [13, 17], x: 6, y: -92, r: 32, damage: 20, kb: 7.5, growth: 16, angle: 86 }),
        hitbox({ frames: [13, 17], x: 4, y: -52, r: 24, damage: 14, kb: 5.5, growth: 11, angle: 82 }),
        platformPillar([13, 17], 15),
      ],
    },
    [MoveId.DSmash]: {
      // Both feet at once: a tremor on both sides, launching low.
      name: 'Tremor Stomp',
      total: 56,
      chargeFrame: 7,
      hitboxes: [
        hitbox({ frames: [14, 17], x: 34, y: -6, r: 30, damage: 18, kb: 6.5, growth: 14, angle: 22 }),
        hitbox({ frames: [14, 17], x: -34, y: -6, r: 30, damage: 18, kb: 6.5, growth: 14, angle: 158 }),
      ],
    },
    [MoveId.NSpecial]: {
      // Hurls a gauntlet: heavy, short range.
      name: 'Gauntlet Toss',
      total: 46,
      landingLag: 12,
      hitboxes: [],
      projectile: { frame: 16, x: px(30), y: px(-46), speed: px(7.5), life: 24, hit: launch(13, 6.5, 11, 35, 18) },
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
