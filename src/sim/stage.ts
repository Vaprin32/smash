import { px } from './fixed';

// Coordinates are fixed point. +x is right, +y is DOWN. The main stage's top surface is y = 0.

/** Solid rectangle: you can stand on it, and it blocks from the sides and below. */
export interface Block {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Pass-through platform: only solid from above, and you can drop through it. */
export interface Platform {
  left: number;
  right: number;
  top: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  /** Ground index to start on (see `surfaceOf`), or -1 for airborne. */
  ground: number;
}

export interface StageDef {
  name: string;
  blocks: readonly Block[];
  platforms: readonly Platform[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** Match-start positions: `spawns[n - 1]` has one per player slot for an n-player match. */
  spawns: readonly (readonly SpawnPoint[])[];
  /** Respawn positions (above the stage), one per player slot. */
  respawns: readonly { x: number; y: number }[];
}

export interface Surface {
  left: number;
  right: number;
  top: number;
  passThrough: boolean;
}

export const STAGES: readonly StageDef[] = [
  {
    name: 'Driftwood Isle',
    blocks: [{ left: px(-380), right: px(380), top: 0, bottom: px(70) }],
    platforms: [
      { left: px(-300), right: px(-140), top: px(-115) },
      { left: px(140), right: px(300), top: px(-115) },
      { left: px(-80), right: px(80), top: px(-225) },
    ],
    blast: { left: px(-1150), right: px(1150), top: px(-950), bottom: px(650) },
    spawns: [
      [{ x: px(-180), y: 0, ground: 0 }],
      [
        { x: px(-180), y: 0, ground: 0 },
        { x: px(180), y: 0, ground: 0 },
      ],
      [
        { x: px(-240), y: 0, ground: 0 },
        { x: px(240), y: 0, ground: 0 },
        { x: 0, y: 0, ground: 0 },
      ],
      [
        { x: px(-240), y: 0, ground: 0 },
        { x: px(240), y: 0, ground: 0 },
        { x: px(-80), y: 0, ground: 0 },
        { x: px(80), y: 0, ground: 0 },
      ],
    ],
    respawns: [
      { x: px(-100), y: px(-380) },
      { x: px(100), y: px(-380) },
      { x: px(-260), y: px(-380) },
      { x: px(260), y: px(-380) },
    ],
  },
];

/**
 * Ground indices: 0..blocks.length-1 are block tops, then platforms follow.
 * -1 means airborne.
 */
export function surfaceOf(stage: StageDef, ground: number): Surface {
  const nb = stage.blocks.length;
  if (ground < nb) {
    const b = stage.blocks[ground]!;
    return { left: b.left, right: b.right, top: b.top, passThrough: false };
  }
  const p = stage.platforms[ground - nb]!;
  return { left: p.left, right: p.right, top: p.top, passThrough: true };
}

/**
 * A ledge: a top corner of a solid block that fighters can hang from. Ledge
 * `2b` is block b's left corner, `2b + 1` its right one. `side` is -1 on
 * a left corner (the fighter hangs on the left, facing right), +1 on a right one.
 */
export interface Ledge {
  x: number;
  y: number;
  side: number;
  block: number;
}

export function ledgeCount(stage: StageDef): number {
  return stage.blocks.length * 2;
}

export function ledgeOf(stage: StageDef, index: number): Ledge {
  const block = index >> 1;
  const b = stage.blocks[block]!;
  const right = (index & 1) === 1;
  return { x: right ? b.right : b.left, y: b.top, side: right ? 1 : -1, block };
}

export function platformGroundIndex(stage: StageDef, platform: number): number {
  return stage.blocks.length + platform;
}
