import type { FighterState } from './state';

export const Action = {
  Idle: 0,
  Walk: 1,
  Run: 2,
  JumpSquat: 3,
  Air: 4,
  /** Landing lag; lasts `landLag` frames. */
  Landing: 5,
  /** Just crossed a blast zone; waiting to respawn. */
  KO: 6,
  /** Floating at the respawn point until the player moves. */
  Respawn: 7,
  /** No stocks left. */
  Out: 8,
  /** Performing `FighterState.move`. actionFrame is the 1-based move frame. */
  Attack: 9,
  /** Launched; can't act until `hitstun` runs out. */
  Hitstun: 10,
  Roll: 11,
  SpotDodge: 12,
  AirDodge: 13,
  /** Helpless after an up special: can drift, nothing else, until landing. */
  SpecialFall: 14,
} as const;

export type ActionId = (typeof Action)[keyof typeof Action];

export const ACTION_NAMES: readonly string[] = [
  'Idle',
  'Walk',
  'Run',
  'JumpSquat',
  'Air',
  'Landing',
  'KO',
  'Respawn',
  'Out',
  'Attack',
  'Hitstun',
  'Roll',
  'SpotDodge',
  'AirDodge',
  'SpecialFall',
];

export function setAction(f: FighterState, action: ActionId): void {
  f.action = action;
  f.actionFrame = 0;
  f.move = -1;
}
