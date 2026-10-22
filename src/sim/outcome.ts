import { Action } from './actions';
import type { MatchState } from './state';

/** Returned by `matchWinner` while more than one fighter still has stocks. */
export const MATCH_ON = -1;
/** Returned by `matchWinner` when the last fighters went out on the same frame. */
export const DRAW = -2;

/** The winning player slot once at most one fighter is left, else MATCH_ON (or DRAW). */
export function matchWinner(s: MatchState): number {
  const alive: number[] = [];
  s.fighters.forEach((f, i) => {
    if (f.action !== Action.Out) alive.push(i);
  });
  if (alive.length > 1 || (alive.length === 1 && s.fighters.length === 1)) return MATCH_ON;
  return alive.length === 1 ? alive[0]! : DRAW;
}
