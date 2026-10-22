import { BASALT } from './basalt';
import { BRICK } from './brick';
import { KESTREL } from './kestrel';
import { LUMEN } from './lumen';
import { PIP } from './pip';
import { ROOK } from './rook';
import { SABLE } from './sable';
import type { FighterDef } from './types';
import { WISP } from './wisp';

/** Indexed by `FighterState.charId`. Order is part of the netcode contract: append only. */
export const FIGHTERS: readonly FighterDef[] = [WISP, BRICK, PIP, KESTREL, LUMEN, BASALT, SABLE, ROOK];
