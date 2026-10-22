// All bindings in one place. Keys are KeyboardEvent.code strings; gamepad
// buttons are indices in the Gamepad API "standard" mapping.

export interface PlayerKeys {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  attack: string[];
  /** Smash attacks (ground only). */
  heavy: string[];
  special: string[];
  /** Shield (hold) / roll / spot dodge / air dodge. */
  dodge: string[];
  dash: string[];
}

export type PadButtons = Record<Exclude<keyof PlayerKeys, 'left' | 'right' | 'up' | 'down'>, number[]>;

/** 'solo': menus and training (player 1 has the whole keyboard). 'versus': local versus. */
export type LayoutName = 'solo' | 'versus';

const NO_KEYS: PlayerKeys = { left: [], right: [], up: [], down: [], jump: [], attack: [], heavy: [], special: [], dodge: [], dash: [] };

export const BINDINGS = {
  /** One PlayerKeys per player slot, per layout. */
  layouts: {
    solo: [
      {
        left: ['KeyA'],
        right: ['KeyD'],
        up: ['KeyW'],
        down: ['KeyS'],
        jump: ['KeyL', 'Space'],
        attack: ['KeyJ'],
        heavy: ['KeyK'],
        special: ['KeyI'],
        dodge: ['KeyE'],
        dash: ['KeyN'],
      },
      NO_KEYS,
    ],
    // The keyboard split in half, no numpad needed. P2's half is P1's mirrored
    // around the middle of each row (A<->Ñ, S<->L, D<->K, F<->J, G<->H, W<->O,
    // E<->I, R<->U, T<->Y, B<->N): movement on the outside, actions inside.
    versus: [
      {
        left: ['KeyA'],
        right: ['KeyD'],
        up: ['KeyW'],
        down: ['KeyS'],
        jump: ['KeyR'],
        attack: ['KeyF'],
        heavy: ['KeyT'],
        special: ['KeyG'],
        dodge: ['KeyE'],
        dash: ['KeyB'],
      },
      {
        left: ['KeyK'],
        right: ['Semicolon'],
        up: ['KeyO'],
        down: ['KeyL'],
        jump: ['KeyU'],
        attack: ['KeyJ'],
        heavy: ['KeyY'],
        special: ['KeyH'],
        dodge: ['KeyI'],
        dash: ['KeyN'],
      },
    ],
  } satisfies Record<LayoutName, PlayerKeys[]>,
  /**
   * Standard mapping, Xbox names: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT,
   * 8 View/Back, 9 Menu/Start, 12-15 d-pad up/down/left/right. Left stick moves.
   */
  gamepad: {
    buttons: {
      attack: [0],
      special: [1],
      jump: [2, 3],
      heavy: [5],
      dodge: [6, 7],
      dash: [4],
    } satisfies PadButtons,
    dpad: { up: 12, down: 13, left: 14, right: 15 },
    /** Pause / start. */
    start: 9,
    /** On character select: move this pad to the other player. */
    swap: 8,
    /** Left-stick deflection (0..1) that counts as a direction. */
    deadzone: 0.5,
  },
  /** Menu keys that work for everyone, in addition to each player's own buttons. */
  menu: {
    confirm: 'Enter',
    back: 'Escape',
  },
  toggleDebug: 'F1',
  /** Training mode only. */
  reset: 'KeyR',
};
