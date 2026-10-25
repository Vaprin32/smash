import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId, platformPillar } from './types';
import { WISP_MOVES } from './wisp';

// Sable: Wisp's normals with a blade's extra reach, plus swordplay specials.
export const SABLE_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 105, size: 117, reach: 130, damage: 110, knockback: 105 },
  {
    // Duelist: long blade; the tip is where it hurts.
    [MoveId.FSmash]: {
      // Overhead cleave: over the top, the tip slamming down in front.
      name: 'Overhead Cleave',
      total: 50,
      chargeFrame: 9,
      hitboxes: [
        hitbox({ frames: [14, 15], x: 50, y: -80, r: 22, damage: 12, kb: 5, growth: 10, angle: 60 }),
        hitbox({ frames: [16, 18], x: 72, y: -30, r: 22, damage: 18, kb: 6.5, growth: 16, angle: 35 }),
      ],
    },
    [MoveId.USmash]: {
      // The blade sweeps from in front, over the head, to behind.
      name: 'Rising Arc',
      total: 48,
      chargeFrame: 7,
      hitboxes: [
        hitbox({ frames: [10, 11], x: 50, y: -40, r: 20, damage: 13, kb: 5.5, growth: 13, angle: 75 }),
        hitbox({ frames: [12, 13], x: 20, y: -90, r: 24, damage: 15, kb: 6.5, growth: 15, angle: 90 }),
        hitbox({ frames: [14, 15], x: -40, y: -60, r: 20, damage: 13, kb: 5.5, growth: 13, angle: 105 }),
        platformPillar([12, 13], 12),
      ],
    },
    [MoveId.DSmash]: {
      // One long low slash around both ankles.
      name: 'Ankle Sweep',
      total: 48,
      chargeFrame: 6,
      hitboxes: [
        hitbox({ frames: [9, 12], x: 62, y: -6, r: 20, damage: 15, kb: 5.5, growth: 14, angle: 18 }),
        hitbox({ frames: [9, 12], x: -62, y: -6, r: 20, damage: 15, kb: 5.5, growth: 14, angle: 162 }),
      ],
    },
    [MoveId.NSpecial]: {
      name: 'Crescent Wave',
      total: 38,
      landingLag: 10,
      hitboxes: [],
      projectile: { frame: 12, x: px(30), y: px(-40), speed: px(8), life: 45, hit: launch(7, 4.5, 7, 35, 14) },
    },
    [MoveId.SideSpecial]: {
      // A long thrust; the tip hits hardest.
      name: 'Lunge',
      total: 42,
      landingLag: 12,
      noDrift: true,
      oncePerAir: true,
      noGravity: [8, 16],
      impulses: [
        { frame: 8, vx: px(9), airVy: px(-1) },
        { frame: 17, vx: px(2) },
      ],
      hitboxes: [
        hitbox({ frames: [10, 16], x: 74, y: -40, r: 14, damage: 13, kb: 6.5, growth: 13, angle: 32 }),
        hitbox({ frames: [10, 16], x: 42, y: -40, r: 16, damage: 8, kb: 4, growth: 8, angle: 40 }),
      ],
    },
    [MoveId.UpSpecial]: {
      name: 'Rising Blade',
      total: 40,
      landingLag: 14,
      helplessAfter: true,
      impulses: [{ frame: 5, vx: px(2), vy: px(-13.5) }],
      hitboxes: [hitbox({ frames: [5, 14], x: 26, y: -70, r: 24, damage: 9, kb: 5.5, growth: 9, angle: 80 })],
    },
  },
);
