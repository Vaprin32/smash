import { px } from '../fixed';
import { deriveMoves } from './derive';
import { hitbox, launch, MoveId } from './types';
import { WISP_MOVES } from './wisp';

// Kestrel: Wisp's normals, faster, plus aggressive diving specials.
export const KESTREL_MOVES = deriveMoves(
  WISP_MOVES,
  { frames: 85, size: 103, reach: 100, damage: 95, knockback: 95 },
  {
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
