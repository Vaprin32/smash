import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Kestrel: Wisp's normals, faster, plus aggressive diving specials.
export const KESTREL_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 85, size: 103, reach: 100, damage: 95, knockback: 95 },
  {
    // Falconer: fast and on the move.
    [MoveId.FSmash]: {
      // Darts forward claws first.
      name: 'Talon Thrust',
      total: 40,
      chargeFrame: 7,
      impulses: [{ frame: 9, vx: px(6) }],
      hitboxes: [hitbox({ frames: [10, 13], x: 30, y: -34, r: 20, damage: 14, kb: 5.5, growth: 14, angle: 35 })],
    },
    [MoveId.USmash]: {
      // Wings sweep front to back over the head.
      name: 'Wing Flare',
      total: 38,
      chargeFrame: 5,
      hitboxes: [
        hitbox({ frames: [8, 9], x: 30, y: -50, r: 20, damage: 12, kb: 5, growth: 13, angle: 80 }),
        hitbox({ frames: [10, 11], x: 0, y: -76, r: 22, damage: 13, kb: 5.5, growth: 13, angle: 90 }),
        hitbox({ frames: [12, 13], x: -30, y: -50, r: 20, damage: 12, kb: 5, growth: 13, angle: 100 }),
        platformPillar([10, 11], 10),
      ],
    },
    [MoveId.DSmash]: {
      // One fast spinning kick low on both sides.
      name: 'Spur Sweep',
      total: 36,
      chargeFrame: 4,
      hitboxes: [
        hitbox({ frames: [7, 9], x: 34, y: -6, r: 18, damage: 11, kb: 5, growth: 12, angle: 25 }),
        hitbox({ frames: [7, 9], x: -34, y: -6, r: 18, damage: 11, kb: 5, growth: 12, angle: 155 }),
      ],
    },
    [MoveId.NSpecial]: {
      // Fast, short-range and weak: a pressure tool.
      name: 'Feather Dart',
      total: 22,
      landingLag: 6,
      hitboxes: [],
      projectile: { frame: 6, x: px(24), y: px(-38), speed: px(12), life: 22, hit: launch(3, 2, 1, 10, 8) },
    },
    [MoveId.SideSpecial]: {
      name: 'Dive Kick',
      total: 32,
      landingLag: 10,
      noDrift: true,
      oncePerAir: true,
      noGravity: [1, 18],
      impulses: [
        { frame: 1, airVy: 0 },
        { frame: 7, vx: px(9), airVy: px(6) },
      ],
      hitboxes: [hitbox({ frames: [7, 18], x: 20, y: -10, r: 18, damage: 9, kb: 5, growth: 10, angle: 45 })],
    },
    [MoveId.UpSpecial]: {
      name: 'Skyward',
      total: 34,
      landingLag: 12,
      helplessAfter: true,
      impulses: [{ frame: 6, vx: px(2), vy: px(-15.5) }],
      hitboxes: [hitbox({ frames: [6, 13], x: 6, y: -40, r: 22, damage: 8, kb: 5, growth: 8, angle: 80 })],
    },
    [MoveId.DownSpecial]: {
      // Stalls, then drops like a stone; spikes anyone underneath.
      name: 'Plummet',
      total: 30,
      landingLag: 14,
      noDrift: true,
      noGravity: [1, 18],
      impulses: [
        { frame: 1, airVy: 0 },
        { frame: 6, airVy: px(13) },
      ],
      hitboxes: [hitbox({ frames: [6, 18], x: 2, y: 4, r: 20, damage: 10, kb: 4, growth: 10, angle: 270 })],
    },
  },
);
