import type { FighterState } from './state';

export const Action = {
  Idle: 0,
  Walk: 1,
  Run: 2,
  JumpSquat: 3,
  Air: 4,
  Landing: 5,
  /** Just crossed a blast zone; waiting to respawn. */
  KO: 6,
  /** Floating at the respawn point until the player moves. */
  Respawn: 7,
  /** No stocks left. */
  Out: 8,
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
];

export function setAction(f: FighterState, action: ActionId): void {
  f.action = action;
  f.actionFrame = 0;
}
