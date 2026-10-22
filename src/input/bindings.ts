// All key bindings in one place. Values are KeyboardEvent.code strings.

export interface PlayerKeys {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  attack: string[];
  special: string[];
  dodge: string[];
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
    },
  ] satisfies PlayerKeys[],
  toggleDebug: 'F1',
  reset: 'KeyR',
};
