import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Pip: Wisp's normals, tiny, quick and weak, plus nimble specials.
export const PIP_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 80, size: 70, reach: 100, damage: 70, knockback: 85 },
  {
    // Hedge Squire: quick, small, works at a distance with the sling.
    [MoveId.FSmash]: {
      // The sling's strap cracks forward: the tip at full reach hits hardest.
      name: 'Sling Snap',
      total: 36,
      chargeFrame: 6,
      hitboxes: [
        hitbox({ frames: [10, 11], x: 46, y: -22, r: 11, damage: 11, kb: 5, growth: 12, angle: 36 }),
        hitbox({ frames: [10, 11], x: 22, y: -22, r: 12, damage: 7, kb: 4, growth: 8, angle: 40 }),
      ],
    },
    [MoveId.USmash]: {
      // A pebble fired straight up.
      name: 'Sky Shot',
      total: 36,
      chargeFrame: 5,
      hitboxes: [
        hitbox({ frames: [8, 11], x: 4, y: -96, r: 14, damage: 10, kb: 5.5, growth: 12, angle: 90 }),
        hitbox({ frames: [8, 11], x: 4, y: -56, r: 16, damage: 8, kb: 4.5, growth: 9, angle: 88 }),
        platformPillar([8, 11], 8),
      ],
    },
    [MoveId.DSmash]: {
      // Pebbles flung low to both sides at once, out at range.
      name: 'Pebble Scatter',
      total: 38,
      chargeFrame: 5,
      hitboxes: [
        hitbox({ frames: [8, 10], x: 50, y: -6, r: 12, damage: 8, kb: 4.5, growth: 11, angle: 20 }),
        hitbox({ frames: [8, 10], x: -50, y: -6, r: 12, damage: 8, kb: 4.5, growth: 11, angle: 160 }),
      ],
    },
    [MoveId.NSpecial]: {
      name: 'Pebble Toss',
      total: 24,
      landingLag: 6,
      hitboxes: [],
      projectile: { frame: 7, x: px(16), y: px(-24), speed: px(8.5), life: 38, hit: launch(3, 2.5, 3, 30, 7) },
    },
    [MoveId.SideSpecial]: {
      name: 'Tumble',
      total: 30,
      landingLag: 8,
      noDrift: true,
      oncePerAir: true,
      noGravity: [4, 14],
      impulses: [
        { frame: 4, vx: px(10), airVy: px(-2) },
        { frame: 15, vx: px(2.5) },
      ],
      hitboxes: [hitbox({ frames: [5, 14], x: 14, y: -20, r: 16, damage: 5, kb: 4, growth: 7, angle: 40 })],
    },
    [MoveId.UpSpecial]: {
      name: 'Pinwheel',
      total: 34,
      landingLag: 10,
      helplessAfter: true,
      impulses: [{ frame: 4, vx: px(1.5), vy: px(-11.5) }],
      hitboxes: [hitbox({ frames: [4, 12], x: 0, y: -26, r: 20, damage: 5, kb: 4.5, growth: 5, angle: 85 })],
    },
  },
);
