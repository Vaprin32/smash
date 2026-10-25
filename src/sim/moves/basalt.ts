import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Basalt: Wisp's normals, huge, very slow and devastating, plus earth-shaking specials.
export const BASALT_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 145, size: 147, reach: 100, damage: 175, knockback: 135 },
  {
    // Stone Golem: the slowest and strongest of all.
    [MoveId.FSmash]: {
      name: 'Boulder Fist',
      total: 66,
      chargeFrame: 11,
      hitboxes: [
        hitbox({ frames: [20, 24], x: 66, y: -56, r: 34, damage: 26, kb: 8, growth: 18, angle: 40 }),
        hitbox({ frames: [20, 24], x: 34, y: -56, r: 26, damage: 18, kb: 6, growth: 12, angle: 45 }),
      ],
    },
    [MoveId.USmash]: {
      // Both fists clap together high overhead.
      name: 'Lava Crown',
      total: 62,
      chargeFrame: 9,
      hitboxes: [
        hitbox({ frames: [16, 20], x: 0, y: -126, r: 40, damage: 25, kb: 8, growth: 17, angle: 90 }),
        hitbox({ frames: [16, 20], x: 0, y: -70, r: 30, damage: 18, kb: 6, growth: 12, angle: 88 }),
        platformPillar([16, 20], 19),
      ],
    },
    [MoveId.DSmash]: {
      // Both fists into the ground: a quake on both sides.
      name: 'Twin Quake',
      total: 66,
      chargeFrame: 9,
      hitboxes: [
        hitbox({ frames: [18, 22], x: 52, y: -10, r: 32, damage: 23, kb: 7.5, growth: 16, angle: 25 }),
        hitbox({ frames: [18, 22], x: -52, y: -10, r: 32, damage: 23, kb: 7.5, growth: 16, angle: 155 }),
      ],
    },
    [MoveId.NSpecial]: {
      // Punches the ground: magma bursts up a little way in front.
      name: 'Eruption',
      total: 62,
      landingLag: 16,
      hitboxes: [hitbox({ frames: [22, 27], x: 76, y: -28, r: 34, damage: 22, kb: 7, growth: 15, angle: 75 })],
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
      // A hop (or a brief hang in the air), then the whole golem drops like a meteor, spiking
      // whatever is below. A jump gets out of the fall at any time from frame 14, hit or not,
      // so it can be used offstage. Touching down cracks the ground both ways (DrillLand).
      name: 'Meteor Drop',
      total: 100,
      noDrift: true,
      oncePerAir: true,
      noGravity: [11, 100],
      jumpCancel: 14,
      jumpCancelOnHit: true,
      landingMove: MoveId.DrillLand,
      impulses: [
        { frame: 1, vx: 0, airVy: px(-2), groundVy: px(-7) },
        { frame: 11, vx: 0, vy: px(24) },
      ],
      hitboxes: [hitbox({ frames: [11, 100], x: 0, y: -30, r: 38, damage: 17, kb: 4.5, growth: 10, angle: 270 })],
    },
    [MoveId.DrillLand]: {
      name: 'Meteor Crater',
      total: 38,
      hitboxes: [
        hitbox({ frames: [1, 4], x: 52, y: -14, r: 40, damage: 15, kb: 7, growth: 12, angle: 40 }),
        hitbox({ frames: [1, 4], x: -52, y: -14, r: 40, damage: 15, kb: 7, growth: 12, angle: 140 }),
      ],
    },
  },
);
