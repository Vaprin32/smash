import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Rook: Wisp's normals, a little stronger, plus solid all-purpose specials.
export const ROOK_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 100, size: 107, reach: 100, damage: 115, knockback: 110 },
  {
    // Captain of the Guard: solid, honest strikes.
    [MoveId.FSmash]: {
      name: 'Heavy Kick',
      total: 46,
      chargeFrame: 8,
      impulses: [{ frame: 10, vx: px(2) }],
      hitboxes: [hitbox({ frames: [12, 14], x: 44, y: -30, r: 22, damage: 17, kb: 6.5, growth: 16, angle: 38 })],
    },
    [MoveId.USmash]: {
      name: 'Rising Palm',
      total: 44,
      chargeFrame: 6,
      hitboxes: [
        hitbox({ frames: [9, 13], x: 10, y: -80, r: 26, damage: 16, kb: 6.5, growth: 15, angle: 85 }),
        hitbox({ frames: [9, 13], x: 16, y: -44, r: 20, damage: 11, kb: 5, growth: 10, angle: 80 }),
        platformPillar([9, 13], 13),
      ],
    },
    [MoveId.DSmash]: {
      // Sweep in front, then behind.
      name: 'Sweep Kick',
      total: 46,
      chargeFrame: 5,
      hitboxes: [
        hitbox({ frames: [8, 10], x: 36, y: -6, r: 20, damage: 15, kb: 6, growth: 14, angle: 25 }),
        hitbox({ frames: [13, 15], x: -36, y: -6, r: 20, damage: 15, kb: 6, growth: 14, angle: 155 }),
      ],
    },
    [MoveId.NSpecial]: {
      // A quick, planted shove of force: pushes straight away rather than launching.
      name: 'Palm Burst',
      total: 30,
      landingLag: 8,
      hitboxes: [hitbox({ frames: [8, 10], x: 30, y: -34, r: 26, damage: 9, kb: 7, growth: 6, angle: 5 })],
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
