import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Rook: Wisp's normals, a little stronger, plus solid all-purpose specials.
export const ROOK_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 100, size: 107, reach: 100, damage: 115, knockback: 110 },
  {
    [MoveId.NSpecial]: {
      name: 'Palm Burst',
      total: 36,
      landingLag: 10,
      impulses: [{ frame: 8, vx: px(3) }],
      hitboxes: [hitbox({ frames: [10, 13], x: 36, y: -36, r: 22, damage: 12, kb: 6, growth: 11, angle: 40 })],
    },
    [MoveId.SideSpecial]: {
      name: 'Spin Kick',
      total: 36,
      landingLag: 10,
      noDrift: true,
      oncePerAir: true,
      noGravity: [6, 16],
      impulses: [
        { frame: 6, vx: px(9), airVy: px(-2) },
        { frame: 17, vx: px(2.5) },
      ],
      hitboxes: [hitbox({ frames: [7, 15], x: 22, y: -32, r: 24, damage: 9, kb: 5, growth: 11, angle: 45 })],
    },
    [MoveId.UpSpecial]: {
      // Strong at the start, weak at the top.
      name: 'Rising Uppercut',
      total: 40,
      landingLag: 12,
      helplessAfter: true,
      impulses: [{ frame: 4, vx: px(2), vy: px(-14) }],
      hitboxes: [
        hitbox({ frames: [4, 8], x: 18, y: -46, r: 20, damage: 12, kb: 6.5, growth: 9, angle: 82 }),
        hitbox({ frames: [9, 14], x: 10, y: -70, r: 20, damage: 5, kb: 4, growth: 5, angle: 85 }),
      ],
    },
    [MoveId.DownSpecial]: {
      name: 'Riposte',
      total: 40,
      landingLag: 10,
      noDrift: true,
      counter: [5, 22],
      noGravity: [1, 22],
      impulses: [{ frame: 1, airVy: 0 }],
      hitboxes: [],
    },
    [MoveId.CounterStrike]: {
      name: 'Riposte Strike',
      total: 30,
      hitboxes: [hitbox({ frames: [2, 5], x: 36, y: -36, r: 30, damage: 14, kb: 6.5, growth: 14, angle: 38 })],
    },
  },
);
