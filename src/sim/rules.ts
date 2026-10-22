// Global (non-fighter) rule constants, in frames.

export const DEFAULT_STOCKS = 3;
/** Frames between crossing a blast zone and reappearing. */
export const KO_RESPAWN_DELAY = 60;
/** Max frames a fighter floats at the respawn point before dropping automatically. */
export const RESPAWN_MAX_WAIT = 120;
/** Invincibility after leaving the respawn point (~2 s). */
export const RESPAWN_INVINCIBILITY = 120;
/** A jump pressed this many frames early (e.g. during landing lag) still comes out. */
export const JUMP_BUFFER_FRAMES = 4;
