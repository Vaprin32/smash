// All key bindings in one place. Values are KeyboardEvent.code strings.

export interface PlayerKeys {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  attack: string[];
  /** Smash attacks on the ground, specials in the air. */
  heavy: string[];
  special: string[];
  /** Shield (hold) / roll / spot dodge / air dodge. */
  dodge: string[];
  dash: string[];
}

export const BINDINGS = {
  players: [
    {
      left: ['KeyA'],
      right: ['KeyD'],
      up: ['KeyW'],
      down: ['KeyS'],
      jump: ['KeyL', 'Space'],
      attack: ['KeyJ'],
      heavy: ['KeyK'],
      special: ['KeyI'],
      dodge: ['Semicolon'],
      dash: ['KeyN'],
    },
    {
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      jump: ['Numpad3'],
      attack: ['Numpad1'],
      heavy: ['Numpad2'],
      special: ['Numpad5'],
      dodge: ['Numpad0'],
      dash: ['Numpad4'],
    },
  ] satisfies PlayerKeys[],
  toggleDebug: 'F1',
  reset: 'KeyR',
};
