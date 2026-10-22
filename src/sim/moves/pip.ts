import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Pip: Wisp's normals, tiny, quick and weak, plus nimble specials.
export const PIP_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 80, size: 70, reach: 100, damage: 70, knockback: 85 },
  {
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
    [MoveId.DownSpecial]: {
      // A springy hop with a hitbox; not helpless, so it's an extra jump.
      name: 'Spring',
      total: 30,
      landingLag: 8,
      oncePerAir: true,
      impulses: [{ frame: 6, vy: px(-9) }],
      hitboxes: [hitbox({ frames: [6, 10], x: 0, y: -8, r: 18, damage: 4, kb: 4, growth: 5, angle: 80 })],
    },
  },
);
