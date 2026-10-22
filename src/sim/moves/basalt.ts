import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Basalt: Wisp's normals, huge, very slow and devastating, plus earth-shaking specials.
export const BASALT_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 145, size: 147, reach: 100, damage: 175, knockback: 135 },
  {
    [MoveId.NSpecial]: {
      name: 'Eruption',
      total: 62,
      landingLag: 16,
      hitboxes: [hitbox({ frames: [22, 27], x: 40, y: -60, r: 34, damage: 22, kb: 7, growth: 15, angle: 70 })],
    },
    [MoveId.SideSpecial]: {
      name: 'Landslide',
      total: 56,
      landingLag: 18,
      noDrift: true,
      oncePerAir: true,
      noGravity: [10, 24],
      impulses: [
        { frame: 10, vx: px(7.5), airVy: px(-1) },
        { frame: 25, vx: px(2) },
      ],
      hitboxes: [hitbox({ frames: [11, 24], x: 36, y: -50, r: 34, damage: 16, kb: 6, growth: 13, angle: 38 })],
    },
    [MoveId.UpSpecial]: {
      name: 'Magma Leap',
      total: 50,
      landingLag: 22,
      helplessAfter: true,
      impulses: [{ frame: 8, vx: px(1.5), vy: px(-13.5) }],
      hitboxes: [hitbox({ frames: [8, 18], x: 10, y: -80, r: 30, damage: 12, kb: 6, growth: 9, angle: 82 })],
    },
    [MoveId.DownSpecial]: {
      // Slams the ground on both sides.
      name: 'Fissure',
      total: 64,
      landingLag: 20,
      noDrift: true,
      hitboxes: [
        hitbox({ frames: [24, 28], x: 52, y: -10, r: 30, damage: 18, kb: 7, growth: 15, angle: 75 }),
        hitbox({ frames: [24, 28], x: -52, y: -10, r: 30, damage: 18, kb: 7, growth: 15, angle: 105 }),
      ],
    },
  },
);
