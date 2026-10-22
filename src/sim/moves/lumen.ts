import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Lumen: Wisp's normals, a bit slower and longer, plus long-range zoning specials.
export const LUMEN_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 110, size: 113, reach: 100, damage: 95, knockback: 100 },
  {
    [MoveId.NSpecial]: {
      // Slow, long-lived and strong: a wall to hide behind.
      name: 'Lumen Orb',
      total: 44,
      landingLag: 10,
      hitboxes: [],
      projectile: { frame: 16, x: px(28), y: px(-44), speed: px(4.5), life: 100, hit: launch(9, 5, 8, 35, 16) },
    },
    [MoveId.SideSpecial]: {
      // The tip of the lance is the strong part.
      name: 'Light Lance',
      total: 40,
      landingLag: 12,
      hitboxes: [
        hitbox({ frames: [14, 17], x: 70, y: -40, r: 16, damage: 11, kb: 6, growth: 11, angle: 30 }),
        hitbox({ frames: [14, 17], x: 40, y: -40, r: 14, damage: 6, kb: 3.5, growth: 5, angle: 50 }),
      ],
    },
    [MoveId.UpSpecial]: {
      name: 'Ascend',
      total: 40,
      landingLag: 14,
      helplessAfter: true,
      impulses: [{ frame: 6, vx: px(2), vy: px(-12) }],
      hitboxes: [hitbox({ frames: [6, 12], x: 0, y: -40, r: 22, damage: 4, kb: 4, growth: 4, angle: 85 })],
    },
    [MoveId.DownSpecial]: {
      // Hovers and bursts outward: an escape when crowded.
      name: 'Flare',
      total: 40,
      landingLag: 10,
      noDrift: true,
      noGravity: [1, 20],
      impulses: [{ frame: 1, airVy: 0 }],
      hitboxes: [hitbox({ frames: [12, 15], x: 0, y: -36, r: 46, damage: 10, kb: 6.5, growth: 10, angle: 60 })],
    },
  },
);
