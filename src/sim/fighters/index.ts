import type { FighterDef } from './types';
import { WISP } from './wisp';

/** Indexed by `FighterState.charId`. Order is part of the netcode contract: append only. */
export const FIGHTERS: readonly FighterDef[] = [WISP];
