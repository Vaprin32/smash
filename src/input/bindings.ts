// All key bindings in one place. Values are KeyboardEvent.code strings.

export interface PlayerKeys {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  attack: string[];
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
      special: ['KeyK'],
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
      special: ['Numpad2'],
      dodge: ['Numpad0'],
      dash: ['Numpad4'],
    },
  ] satisfies PlayerKeys[],
  toggleDebug: 'F1',
  reset: 'KeyR',
};
