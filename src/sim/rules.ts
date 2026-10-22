import { px } from './fixed';

// Global (non-fighter) rule constants. Durations in frames.

export const DEFAULT_STOCKS = 3;
/** Frames between crossing a blast zone and reappearing. */
export const KO_RESPAWN_DELAY = 60;
/** Max frames a fighter floats at the respawn point before dropping automatically. */
export const RESPAWN_MAX_WAIT = 120;
/** Invincibility after leaving the respawn point (~2 s). */
export const RESPAWN_INVINCIBILITY = 120;
/** A jump pressed this many frames early (e.g. during landing lag) still comes out. */
export const JUMP_BUFFER_FRAMES = 4;
/** Same for attack / special / dodge presses. */
export const ACTION_BUFFER_FRAMES = 5;

export const MAX_DAMAGE = 999;
/** Hitlag (freeze on hit, both fighters) = base + damage / divisor, capped. */
export const HITLAG_BASE = 3;
export const HITLAG_DAMAGE_DIVISOR = 3;
export const HITLAG_MAX = 14;
/** Hitstun frames = launch speed (px/frame) * NUM / DEN. */
export const HITSTUN_NUM = 5;
export const HITSTUN_DEN = 2;
/** Launch speed lost per frame while in hitstun (on top of gravity). */
export const KNOCKBACK_DECAY = px(0.3);
/** Hitting the ground mid-hitstun cuts the remaining hitstun to at most this. */
export const KNOCKDOWN_HITSTUN = 12;
