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
export const JUMP_BUFFER_FRAMES = 6;
/** Same for attack / special / dodge presses. */
export const ACTION_BUFFER_FRAMES = 6;

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

// Shield (Ultimate-style). Shield HP is in hundredths: 5000 = 50.00.
export const SHIELD_MAX = 5000;
/** HP lost per frame while holding shield. */
export const SHIELD_DECAY = 15;
/** HP regained per frame while not shielding. */
export const SHIELD_REGEN = 8;
/** Shield HP lost per 1% of hit damage (1.19x). */
export const SHIELD_DAMAGE_PER_PERCENT = 119;
/** Shieldstun frames = damage * NUM / DEN + BASE. */
export const SHIELDSTUN_NUM = 3;
export const SHIELDSTUN_DEN = 5;
export const SHIELDSTUN_BASE = 2;
/** Shield pushback speed = base + damage * perPercent (fixed px/frame). */
export const SHIELD_PUSH_BASE = px(1.2);
export const SHIELD_PUSH_PER_PERCENT = px(0.18);
/** Frames of lag after letting go of shield. */
export const SHIELD_DROP_FRAMES = 11;
/** Getting hit within this many frames of releasing shield is a parry. */
export const PARRY_WINDOW = 5;
/** Extra freeze the attacker suffers when parried. */
export const PARRY_ATTACKER_LAG = 16;
/** Upward pop when a shield breaks, and how long the fighter stays dizzy (counted on the ground). */
export const SHIELD_BREAK_POP = px(8);
export const SHIELD_BREAK_STUN = 200;
/** Shield HP after recovering from a break. */
export const SHIELD_BREAK_RESET = 3000;

// Smash attack charge (Ultimate: up to 60 frames for 1.4x).
export const MAX_SMASH_CHARGE = 60;
/** Charged damage/base knockback = value * (CHARGE_DEN + charge) / CHARGE_DEN. */
export const CHARGE_DEN = 150;

// Grabs.
/** The held fighter is kept this percent of both fighters' half-widths in front of the grabber. */
export const GRAB_HOLD_PERCENT = 72;
/** Frames a grabbed fighter is held: base + damage / divisor, capped. Mashing shortens it. */
export const GRAB_HOLD_BASE = 60;
export const GRAB_HOLD_DAMAGE_DIVISOR = 2;
export const GRAB_HOLD_MAX = 200;
export const GRAB_MASH_FRAMES = 4;
/** Both fighters slide apart at this speed when the held fighter breaks free. */
export const GRAB_RELEASE_SPEED = px(4);

// Ledges (Ultimate-style).
/** Grab reach: how far the hands may be from the ledge corner, sideways (out from the stage) and up/down. */
export const LEDGE_REACH_OUT = px(40);
export const LEDGE_REACH_IN = px(12);
export const LEDGE_REACH_UP = px(36);
export const LEDGE_REACH_DOWN = px(48);
/** Intangibility on the first ledge grab since touching the ground; regrabs get none (no ledge stalling). */
export const LEDGE_GRAB_INVINCIBILITY = 45;
/** Frames hanging before any ledge option is accepted. */
export const LEDGE_ACTIONABLE = 6;
/** Hanging longer than this lets go. */
export const LEDGE_MAX_HANG = 300;
/** After letting go (or being knocked off), frames before a ledge can be grabbed again. */
export const LEDGE_REGRAB_COOLDOWN = 30;
/** Climbing up takes this long (intangible throughout). */
export const LEDGE_CLIMB_FRAMES = 14;
/** Getting pushed off a ledge by someone else grabbing it. */
export const LEDGE_TRUMP_PUSH = px(3);

/** How long an attacker is frozen when their hit is countered. */
export const COUNTER_FREEZE = 18;
