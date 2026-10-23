// How well a CPU plays. Every difference between the levels is one of these
// numbers; the decision logic in cpu.ts is the same for all of them.

export interface CpuLevel {
  name: string;
  /** One line for the setup screen. */
  blurb: string;
  /** Frames between something happening and the CPU seeing it. */
  reaction: number;
  /** Frames between fresh decisions while nothing urgent is going on. */
  thinkEvery: number;
  /** Chance to take an opening for an attack when it sees one. */
  aggression: number;
  /** Chance to shield or dodge an attack it sees coming. */
  defense: number;
  /** Chance per decision to dawdle instead of doing anything useful. */
  idle: number;
  /** Chance per frame to mash while grabbed. */
  mash: number;
  /** Frames between projectile shots, so it comes in to fight rather than only zoning. */
  shotCooldown: number;
  /** Picks the best attack rather than any that would hit; grabs out of shield, dashes, fast-falls, pummels. */
  smart: boolean;
}

export const CPU_LEVELS: readonly CpuLevel[] = [
  {
    name: 'Easy',
    blurb: 'Slow to react, rarely blocks, wanders about',
    reaction: 24,
    thinkEvery: 12,
    aggression: 0.4,
    defense: 0.05,
    idle: 0.25,
    mash: 0.2,
    shotCooldown: 160,
    smart: false,
  },
  {
    name: 'Normal',
    blurb: 'Keeps up the pressure and blocks now and then',
    reaction: 13,
    thinkEvery: 6,
    aggression: 0.65,
    defense: 0.3,
    idle: 0.06,
    mash: 0.5,
    shotCooldown: 100,
    smart: false,
  },
  {
    name: 'Hard',
    blurb: 'Quick, picks its moves well, blocks and punishes',
    reaction: 7,
    thinkEvery: 2,
    aggression: 0.95,
    defense: 0.55,
    idle: 0,
    mash: 1,
    shotCooldown: 70,
    smart: true,
  },
];

export const DEFAULT_CPU_LEVEL = 1;
