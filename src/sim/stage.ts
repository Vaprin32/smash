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
  /** Match-start positions, one per player slot. */
  spawns: readonly SpawnPoint[];
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
      { x: px(-180), y: 0, ground: 0 },
      { x: px(180), y: 0, ground: 0 },
    ],
    respawns: [
      { x: px(-100), y: px(-380) },
      { x: px(100), y: px(-380) },
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

export function platformGroundIndex(stage: StageDef, platform: number): number {
  return stage.blocks.length + platform;
}
