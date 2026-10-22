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
  /** Quick ground burst (Dash button). */
  Dash: 15,
  /** Holding shield. */
  Shield: 16,
  /** Frozen behind shield after blocking a hit; `hitstun` counts it down. */
  ShieldStun: 17,
  /** Letting go of shield; the first PARRY_WINDOW frames parry. */
  ShieldDrop: 18,
  /** Shield broke: popped up, then dizzy on the ground while `hitstun` counts down. */
  ShieldBreak: 19,
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
  'Dash',
  'Shield',
  'ShieldStun',
  'ShieldDrop',
  'ShieldBreak',
];

/** Grounded states that just become Air when the fighter leaves the ground. */
export function isGroundFree(action: number): boolean {
  switch (action) {
    case Action.Idle:
    case Action.Walk:
    case Action.Run:
    case Action.JumpSquat:
    case Action.Landing:
    case Action.Dash:
    case Action.Shield:
    case Action.ShieldStun:
    case Action.ShieldDrop:
      return true;
  }
  return false;
}

export function setAction(f: FighterState, action: ActionId): void {
  f.action = action;
  f.actionFrame = 0;
  f.move = -1;
}
