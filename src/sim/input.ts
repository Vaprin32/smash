// One bitmask per player per frame. Bits 9+ are free for future buttons.

export type InputBits = number;

export const Btn = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  Jump: 1 << 4,
  Attack: 1 << 5,
  Special: 1 << 6,
  /** Shield on the ground (hold), air dodge in the air. */
  Dodge: 1 << 7,
  Dash: 1 << 8,
} as const;
