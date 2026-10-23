// Desync detection. Every CHECKSUM_INTERVAL frames each peer hashes its
// confirmed state (simulated with both players' real inputs, so it can never
// change again) and sends the hash along. If the two hashes for a frame
// differ, the simulations have diverged: we log our state, send it to the
// peer so their console shows both (and the fields that differ), and remember
// the first such frame.

import { deserializeState, FIGHTER_FIELDS, type MatchState } from '../sim/state';

/** Checksums kept on each side while waiting for the other one. */
const KEEP = 8;
/** The state is sent this many times: one lost packet shouldn't lose it. */
const DUMP_COPIES = 3;

const hex = (h: number) => `0x${(h >>> 0).toString(16).padStart(8, '0')}`;

export class DesyncDetector {
  /** First frame whose hashes differed, or -1. */
  frame = -1;
  /** Checksums compared and found equal. */
  matched = 0;
  /** Our latest checksum (frame -1: none yet), sent with every packet until there is a newer one. */
  latest = { frame: -1, hash: 0 };
  private local = new Map<number, { hash: number; bytes: Uint8Array }>();
  private remote = new Map<number, number>();
  /** Newest frame compared; older hashes arriving late are ignored. */
  private compared = -1;
  /** The peer's state at the frame we disagreed on, once it arrives. */
  private remoteState: MatchState | null = null;
  private diffLogged = false;

  /** `sendState` sends our state at the desynced frame to the peer. */
  constructor(private sendState: (frame: number, bytes: Uint8Array) => void) {}

  addLocal(frame: number, hash: number, bytes: Uint8Array): void {
    this.local.set(frame, { hash, bytes });
    trim(this.local);
    this.latest = { frame, hash };
    const theirs = this.remote.get(frame);
    if (theirs !== undefined) this.compare(frame, hash, theirs);
    this.logDiff();
  }

  addRemote(frame: number, hash: number): void {
    if (frame < 0 || frame <= this.compared) return;
    const mine = this.local.get(frame);
    if (mine) {
      this.compare(frame, mine.hash, hash);
    } else {
      this.remote.set(frame, hash);
      trim(this.remote);
    }
  }

  /** The peer's state at a frame where we disagreed (it may arrive before we have confirmed that frame). */
  onRemoteState(frame: number, bytes: Uint8Array): void {
    if (this.remoteState) return; // a repeat copy
    try {
      this.remoteState = deserializeState(bytes);
    } catch {
      return;
    }
    if (this.remoteState.frame !== frame) {
      this.remoteState = null;
      return;
    }
    console.log(`Remote state at frame ${frame}:`, this.remoteState, bytes);
    this.logDiff();
  }

  private compare(frame: number, mine: number, theirs: number): void {
    this.compared = frame;
    this.remote.delete(frame);
    if (mine === theirs) {
      this.matched++;
      return;
    }
    if (this.frame >= 0) return;
    this.frame = frame;
    const bytes = this.local.get(frame)!.bytes;
    console.error(`DESYNC at frame ${frame}: local hash ${hex(mine)}, remote hash ${hex(theirs)}`);
    console.log(`Local state at frame ${frame}:`, deserializeState(bytes), bytes);
    for (let i = 0; i < DUMP_COPIES; i++) this.sendState(frame, bytes);
  }

  /** Once we have both states for the same frame, list the fields that differ. */
  private logDiff(): void {
    if (this.diffLogged || !this.remoteState) return;
    const frame = this.remoteState.frame;
    const mine = this.local.get(frame);
    if (!mine) return;
    this.diffLogged = true;
    console.log(`Differences at frame ${frame} (local vs remote):`, diffStates(deserializeState(mine.bytes), this.remoteState));
  }
}

/** Drop the oldest entries beyond KEEP (maps iterate in insertion order). */
function trim<V>(map: Map<number, V>): void {
  for (const key of map.keys()) {
    if (map.size <= KEEP) return;
    map.delete(key);
  }
}

/** Every field that differs, e.g. "P1.damage: 12 vs 13". */
export function diffStates(a: MatchState, b: MatchState): string[] {
  const out: string[] = [];
  for (const k of ['frame', 'rng', 'stageId'] as const) if (a[k] !== b[k]) out.push(`${k}: ${a[k]} vs ${b[k]}`);
  const n = Math.max(a.fighters.length, b.fighters.length);
  for (let i = 0; i < n; i++) {
    const fa = a.fighters[i], fb = b.fighters[i];
    if (!fa || !fb) {
      out.push(`P${i + 1}: missing on one side`);
      continue;
    }
    for (const k of FIGHTER_FIELDS) if (fa[k] !== fb[k]) out.push(`P${i + 1}.${k}: ${fa[k]} vs ${fb[k]}`);
  }
  return out;
}
