// A computer-controlled player. Every frame it looks at the match (its
// opponents as they were `level.reaction` frames ago, itself as it is now)
// and returns the same kind of input bitmask a person's controller would, so
// the sim, replays and the HUD can't tell the difference. It only reads sim
// state. Its own randomness is a seeded xorshift, so a CPU fed the same
// states always presses the same buttons.

import { Action } from '../sim/actions';
import { knockback } from '../sim/combat';
import { FIGHTERS } from '../sim/fighters';
import type { FighterDef } from '../sim/fighters/types';
import { ONE, px } from '../sim/fixed';
import { Btn, type InputBits } from '../sim/input';
import { MoveId, type MoveDef, type MoveIdValue } from '../sim/moves/types';
import { LEDGE_ACTIONABLE } from '../sim/rules';
import { ledgeOf, STAGES, type StageDef } from '../sim/stage';
import type { FighterState, MatchState } from '../sim/state';
import type { CpuLevel } from './levels';
import { firstHit, moveEnd, touches, untouchableFor } from './predict';

const DIRS = Btn.Left | Btn.Right | Btn.Up | Btn.Down;

/** Left / Right for a sign. */
function xBit(d: number): InputBits {
  return d > 0 ? Btn.Right : d < 0 ? Btn.Left : 0;
}

/** An attack the CPU can choose: which buttons, and which way the fighter faces doing it. */
interface Option {
  move: MoveIdValue;
  /** Pressed fresh. */
  press: InputBits;
  /** Held with it, given the direction toward the target `d` and the current facing `f`. */
  dirs: (d: number, f: number) => InputBits;
  /** The move turns the fighter toward the target. */
  turns?: boolean;
}

const none = () => 0;
const up = () => Btn.Up;
const down = () => Btn.Down;
const toward = (d: number) => xBit(d);

const SMASHES_AND_SPECIALS: Option[] = [
  { move: MoveId.FSmash, press: Btn.Heavy, dirs: toward, turns: true },
  { move: MoveId.USmash, press: Btn.Heavy, dirs: up },
  { move: MoveId.DSmash, press: Btn.Heavy, dirs: down },
  { move: MoveId.Grab, press: Btn.Attack | Btn.Dodge, dirs: none },
  { move: MoveId.NSpecial, press: Btn.Special, dirs: none },
  { move: MoveId.SideSpecial, press: Btn.Special, dirs: toward, turns: true },
  { move: MoveId.UpSpecial, press: Btn.Special, dirs: up },
  { move: MoveId.DownSpecial, press: Btn.Special, dirs: down },
];

const GROUND_OPTIONS: Option[] = [
  { move: MoveId.Jab1, press: Btn.Attack, dirs: none },
  { move: MoveId.FTilt, press: Btn.Attack, dirs: toward, turns: true },
  { move: MoveId.UTilt, press: Btn.Attack, dirs: up },
  { move: MoveId.DTilt, press: Btn.Attack, dirs: down },
  ...SMASHES_AND_SPECIALS,
];

/** While running or dashing, Attack is always the dash attack. */
const RUN_OPTIONS: Option[] = [{ move: MoveId.DashAttack, press: Btn.Attack, dirs: none }, ...SMASHES_AND_SPECIALS];

const AIR_OPTIONS: Option[] = [
  { move: MoveId.NAir, press: Btn.Attack, dirs: none },
  { move: MoveId.FAir, press: Btn.Attack, dirs: (_d, f) => xBit(f) },
  { move: MoveId.BAir, press: Btn.Attack, dirs: (_d, f) => xBit(-f) },
  { move: MoveId.UAir, press: Btn.Attack, dirs: up },
  { move: MoveId.DAir, press: Btn.Attack, dirs: down },
  { move: MoveId.NSpecial, press: Btn.Special, dirs: none },
  { move: MoveId.SideSpecial, press: Btn.Special, dirs: toward, turns: true },
  { move: MoveId.DownSpecial, press: Btn.Special, dirs: down },
];

/** The main stage's outline (fixed point). */
interface Extents {
  left: number;
  right: number;
  top: number;
}

function extentsOf(stage: StageDef): Extents {
  return {
    left: Math.min(...stage.blocks.map((b) => b.left)),
    right: Math.max(...stage.blocks.map((b) => b.right)),
    top: Math.min(...stage.blocks.map((b) => b.top)),
  };
}

/** Airborne and past the stage's edges or below its top. */
function isOffstage(f: FighterState, e: Extents): boolean {
  return f.ground < 0 && (f.x < e.left || f.x > e.right || f.y > e.top + px(4));
}

function isShielding(f: FighterState): boolean {
  return f.action === Action.Shield || f.action === Action.ShieldStun;
}

/**
 * Which of a fighter's specials help it get back to the stage: a once-per-air
 * side special that rushes forward, or a once-per-air down special that is
 * really an extra jump. (Reusable ones would just stall it in mid-air.)
 */
function recoveryMoves(def: FighterDef): { side: boolean; down: boolean } {
  const pushes = (m: MoveDef, test: (vx: number, vy: number) => boolean) =>
    m.oncePerAir === true && !m.helplessAfter && !m.counter && (m.impulses ?? []).some((i) => test(i.vx ?? 0, i.airVy ?? i.vy ?? 0));
  const dives = (m: MoveDef) => (m.impulses ?? []).some((i) => (i.airVy ?? i.vy ?? 0) > 0);
  const side = def.moves[MoveId.SideSpecial]!;
  const dn = def.moves[MoveId.DownSpecial]!;
  return {
    side: pushes(side, (vx) => vx >= px(5)) && !dives(side),
    down: pushes(dn, (_vx, vy) => vy <= -px(5)) && !dives(dn),
  };
}

export class CpuPlayer {
  /** The last `reaction + 1` states; `history[0]` is what the CPU "sees" of its opponents. */
  private history: MatchState[] = [];
  private prev: InputBits = 0;
  /** Inputs already decided for the coming frames (button releases, jump squats). */
  private queue: InputBits[] = [];
  /** Directions held between decisions. */
  private hold: InputBits = 0;
  private thinkIn = 0;
  private target = -1;
  private targetFor = 0;
  private respawnWait = -1;
  /** Frames left before taking a ledge option (-1: not hanging). */
  private ledgeWait = -1;
  /** Pummels left before throwing (-1: not holding anyone). */
  private pummels = -1;
  /** Attacks already seen coming: whether this CPU chose to defend against each. */
  private defending = new Map<string, boolean>();
  /** Frames until it may fire another projectile. */
  private shotIn = 0;
  private rng: number;

  constructor(
    readonly slot: number,
    readonly level: CpuLevel,
    seed: number,
  ) {
    this.rng = (seed ^ Math.imul(slot + 1, 0x9e3779b9)) | 0 || 1;
  }

  /** This frame's input. Call once for every simulated frame, in order. */
  think(s: MatchState): InputBits {
    this.history.push(s);
    if (this.history.length > this.level.reaction + 1) this.history.shift();
    if (this.shotIn > 0) this.shotIn--;
    const out = this.decide(s, s.fighters[this.slot]!);
    this.prev = out;
    return out;
  }

  private decide(s: MatchState, me: FighterState): InputBits {
    const stage = STAGES[s.stageId]!;
    const ext = extentsOf(stage);
    const def = FIGHTERS[me.charId]!;
    if (me.action !== Action.Respawn) this.respawnWait = -1;
    if (me.action !== Action.LedgeHang) this.ledgeWait = -1;
    if (me.action !== Action.Holding && !(me.action === Action.Attack && me.move === MoveId.Pummel)) this.pummels = -1;

    switch (me.action) {
      case Action.Out:
      case Action.KO:
      case Action.Hitstun:
      case Action.ShieldBreak:
        this.queue = [];
        return 0;
      case Action.Held:
        this.queue = [];
        return this.mash();
      case Action.Respawn:
        return this.respawn(me);
      case Action.LedgeClimb:
      case Action.LedgeClimbAttack:
      case Action.LedgeClimbRoll:
        this.queue = [];
        return 0;
    }
    if (this.queue.length > 0) return this.queue.shift()!;

    const seen = this.history[0]!;
    switch (me.action) {
      case Action.LedgeHang:
        return this.onLedge(me, stage);
      case Action.Holding:
        return this.holding(me);
      case Action.ShieldStun:
        return Btn.Dodge;
      case Action.SpecialFall:
      case Action.AirDodge:
        return this.towardStage(me, ext);
      case Action.Attack:
        return this.duringMove(seen, me, def, ext);
    }
    if (isOffstage(me, ext)) return this.recover(me, def, ext);

    const threat = this.threat(seen, me, stage);
    if (me.action === Action.Shield) return this.shielding(threat !== undefined, seen, me, def, stage);
    // Busy for a moment: keep going the way it was.
    if (
      me.action === Action.JumpSquat ||
      me.action === Action.Landing ||
      me.action === Action.Roll ||
      me.action === Action.SpotDodge ||
      me.action === Action.ShieldDrop
    ) {
      return this.hold & DIRS;
    }
    if (threat) {
      const d = this.defend(threat, me);
      if (d !== undefined) return d;
    }

    const t = this.pickTarget(seen, me);
    if (t < 0) return 0;
    if (--this.thinkIn > 0) return this.keepMoving(me, def, ext);
    this.thinkIn = this.level.thinkEvery + this.rand(3);
    if (this.chance(this.level.idle)) {
      this.hold = 0;
      return 0;
    }
    return this.attack(seen, me, def, stage, ext, t) ?? this.move(seen, me, def, ext, t);
  }

  // ---- Attacking ----

  /** Press an attack that would connect right now, if it sees one and feels like it. */
  private attack(seen: MatchState, me: FighterState, def: FighterDef, stage: StageDef, ext: Extents, t: number): InputBits | undefined {
    const options = me.ground < 0 ? AIR_OPTIONS : me.action === Action.Run || me.action === Action.Dash ? RUN_OPTIONS : GROUND_OPTIONS;
    const them = seen.fighters[t]!;
    const d = Math.sign(them.x - me.x) || me.facing;
    const found: { o: Option; score: number }[] = [];

    for (const o of options) {
      const m = def.moves[o.move];
      if (!m || m.counter) continue;
      if (me.ground < 0 && m.oncePerAir && me.oncePerAirUsed & (1 << o.move)) continue;
      // One projectile out at a time (the move would come out empty), and not too often.
      if (m.projectile && (me.projLife > 0 || this.shotIn > 0)) continue;
      const facing = o.turns ? d : me.facing;
      if (!this.safe(me, m, facing, stage, ext)) continue;
      let best = 0;
      seen.fighters.forEach((v, j) => {
        if (j === this.slot || v.action === Action.Out) return;
        const hit = firstHit(me, m, facing, 0, v, stage, m.projectile ? 70 : 45);
        if (!hit) return;
        const vst = FIGHTERS[v.charId]!.stats;
        let value: number;
        if (o.move === MoveId.Grab) {
          value = isShielding(v) ? 30 : 9;
        } else {
          // Launch power matters more the closer the target is to being KO'd.
          const launch = knockback(hit.box, v.damage + hit.box.damage, vst.weight) / ONE;
          value = hit.box.damage + launch * (0.2 + v.damage / 100);
          if (isShielding(v)) value *= 0.25;
        }
        if (j === t) value *= 1.25;
        // Quick moves first; a long recovery (time to be punished) counts against a move.
        const after = m.projectile ? 0 : Math.max(0, m.total - hit.wait);
        best = Math.max(best, value / (hit.wait + 4 + after * 0.3));
      });
      if (best > 0) found.push({ o, score: best * (0.85 + this.rand(31) / 100) });
    }
    if (found.length === 0 || !this.chance(this.level.aggression)) return undefined;

    let pick: Option;
    if (this.level.smart) {
      found.sort((a, b) => b.score - a.score);
      pick = found[0]!.o;
    } else {
      pick = found[this.rand(found.length)]!.o;
    }
    if (def.moves[pick.move]!.projectile) this.shotIn = this.level.shotCooldown;
    const dirs = pick.dirs(d, me.facing);
    this.hold = dirs & (Btn.Left | Btn.Right);
    return this.run(this.pressSeq(dirs, pick.press));
  }

  /** A move is safe if it won't carry the fighter off the stage (or leave it helpless out there). */
  private safe(me: FighterState, m: MoveDef, facing: number, stage: StageDef, ext: Extents): boolean {
    const end = moveEnd(me, m, facing, stage);
    if (m.helplessAfter) return end.grounded || (end.x > ext.left + px(60) && end.x < ext.right - px(60));
    if (me.ground >= 0 && end.grounded) return end.x > ext.left && end.x < ext.right;
    return end.grounded || (end.x > ext.left - px(30) && end.x < ext.right + px(30) && end.y < ext.top + px(10));
  }

  /** Mid-move: drift (back to the stage if need be) and continue jab combos that connected. */
  private duringMove(seen: MatchState, me: FighterState, def: FighterDef, ext: Extents): InputBits {
    if (isOffstage(me, ext)) return this.towardStage(me, ext);
    const m = def.moves[me.move];
    if (m?.next && me.hitMask !== 0 && me.actionFrame >= m.next.from - 1 && me.actionFrame <= m.next.to) {
      return this.prev & Btn.Attack ? 0 : Btn.Attack;
    }
    if (me.ground >= 0) return 0;
    const t = this.target >= 0 ? seen.fighters[this.target] : undefined;
    return t ? xBit(t.x - me.x) : 0;
  }

  // ---- Moving ----

  /** Pick where to go and how: walk, run, dash, hop, jump onto or drop from platforms. */
  private move(seen: MatchState, me: FighterState, def: FighterDef, ext: Extents, t: number): InputBits {
    const them = seen.fighters[t]!;
    const st = def.stats;
    const dx = them.x - me.x;
    const dy = them.y - me.y; // < 0: they are above
    const adx = Math.abs(dx);
    const reach = this.reach(def);
    const theyOff = isOffstage(them, ext);
    const margin = this.edgeMargin(def);
    // Stand just within reach; if they're off the stage, wait at the edge for them.
    let goal = theyOff ? them.x : them.x - (Math.sign(dx) || 1) * Math.round(reach * 0.6);
    goal = Math.max(ext.left + margin, Math.min(ext.right - margin, goal));
    const gx = goal - me.x;
    const dir = Math.abs(gx) > px(10) ? xBit(gx) : 0;

    if (me.ground < 0) {
      this.hold = xBit(them.x - me.x);
      if (!theyOff && dy < -px(50) && me.vy >= 0 && me.jumpsLeft > 0 && adx < px(140)) return this.run(this.pressSeq(this.hold, Btn.Jump));
      if (this.level.smart && dy > px(60) && me.vy >= 0 && !me.fastFall) return this.run(this.pressSeq(this.hold, Btn.Down));
      return this.hold;
    }

    const onPlatform = me.ground >= STAGES[seen.stageId]!.blocks.length;
    if (dy > px(40) && onPlatform && adx < px(220)) return this.run(this.pressSeq(0, Btn.Down));
    if (!theyOff && dy < -px(70) && adx < px(170)) return this.jump(def, dir, true);
    if (!theyOff && adx < reach * 3 && adx > reach && this.chance(0.2)) return this.jump(def, xBit(dx), false);
    if (this.level.smart && dir && Math.abs(gx) > px(220) && me.dashCooldown === 0 && me.action !== Action.Run && this.chance(0.5)) {
      this.hold = dir;
      return this.run(this.pressSeq(dir, Btn.Dash));
    }
    // Close enough: turn to face them (for jabs and projectiles), else walk / run there.
    this.hold = dir || (Math.sign(dx) !== me.facing && adx > px(4) ? xBit(dx) : 0);
    if (!dir && st.runDelay > 0 && this.hold) this.queue = [0]; // a tap turns without walking off
    return this.keepMoving(me, def, ext);
  }

  /** Keep holding the chosen direction, but never walk off the edge. */
  private keepMoving(me: FighterState, def: FighterDef, ext: Extents): InputBits {
    let h = this.hold & DIRS;
    if (me.ground >= 0) {
      const margin = this.edgeMargin(def);
      if (h & Btn.Left && me.x < ext.left + margin) h &= ~Btn.Left;
      if (h & Btn.Right && me.x > ext.right - margin) h &= ~Btn.Right;
    }
    return h;
  }

  /** Press jump; a full hop keeps it held through the jump squat. */
  private jump(def: FighterDef, dir: InputBits, full: boolean): InputBits {
    this.hold = dir;
    const frames = def.stats.jumpSquat + def.stats.shortHopWindow + 1;
    return this.run([...this.pressSeq(dir, Btn.Jump), ...new Array<InputBits>(frames).fill(dir | (full ? Btn.Jump : 0))]);
  }

  /** Distance it likes to keep from its target: about its side tilt's reach. */
  private reach(def: FighterDef): number {
    const hb = def.moves[MoveId.FTilt]!.hitboxes;
    return Math.max(px(30), ...hb.map((h) => h.x + h.r));
  }

  /** How far from an edge it stops: room to brake from a run, plus its own width. */
  private edgeMargin(def: FighterDef): number {
    const st = def.stats;
    return px(24) + (st.width >> 1) + Math.round((st.runSpeed * st.runSpeed) / (2 * st.groundFriction));
  }

  /** Nearest opponent still in the match (preferring hittable, and on Hard, damaged ones); sticks with it a while. */
  private pickTarget(seen: MatchState, me: FighterState): number {
    const cur = seen.fighters[this.target];
    if (this.targetFor-- > 0 && cur && cur.action !== Action.Out) return this.target;
    let best = -1, bestCost = Infinity;
    seen.fighters.forEach((o, j) => {
      if (j === this.slot || o.action === Action.Out) return;
      let cost = Math.hypot(o.x - me.x, o.y - me.y);
      if (untouchableFor(o) > 30) cost += px(500);
      if (this.level.smart) cost -= o.damage * px(1.5);
      if (cost < bestCost) {
        bestCost = cost;
        best = j;
      }
    });
    this.target = best;
    this.targetFor = 30 + this.rand(40);
    return best;
  }

  // ---- Defending ----

  /** The first attack it sees coming its way (a move or a projectile), if any. */
  private threat(seen: MatchState, me: FighterState, stage: StageDef): { key: string; grab: boolean } | undefined {
    if (untouchableFor(me) > 8) return undefined;
    const mst = FIGHTERS[me.charId]!.stats;
    for (let i = 0; i < seen.fighters.length; i++) {
      const o = seen.fighters[i]!;
      if (i === this.slot) continue;
      const odef = FIGHTERS[o.charId]!;
      if (o.action === Action.Attack && o.hitlag === 0) {
        const m = odef.moves[o.move]!;
        if (firstHit(o, m, o.facing, o.actionFrame, me, stage, 14)) {
          return { key: `${i}:${seen.frame - o.actionFrame}`, grab: m.grabbox !== undefined };
        }
      }
      const pr = odef.moves[MoveId.NSpecial]!.projectile;
      if (o.projLife > 0 && pr) {
        for (let k = 1; k <= 16; k++) {
          if (touches(o.projX + o.projVx * k, o.projY, pr.hit.r, me, mst)) {
            return { key: `${i}:p${seen.frame - (pr.life - o.projLife)}`, grab: false };
          }
        }
      }
    }
    return undefined;
  }

  /** Shield (or spot dodge a grab, or air dodge) if it decides to; undefined to carry on. */
  private defend(threat: { key: string; grab: boolean }, me: FighterState): InputBits | undefined {
    let yes = this.defending.get(threat.key);
    if (yes === undefined) {
      yes = this.chance(this.level.defense);
      if (this.defending.size > 32) this.defending.clear();
      this.defending.set(threat.key, yes);
    }
    if (!yes) return undefined;
    if (me.ground < 0) return this.level.smart && !me.airDodgeUsed ? this.run(this.pressSeq(0, Btn.Dodge)) : undefined;
    if (threat.grab || (this.level.smart && this.chance(0.2))) return this.run(this.pressSeq(0, Btn.Down | Btn.Dodge));
    return this.run(this.pressSeq(0, Btn.Dodge));
  }

  /** Hold shield while the attack lasts, then let go (on Hard, grab whoever is in reach). */
  private shielding(threatened: boolean, seen: MatchState, me: FighterState, def: FighterDef, stage: StageDef): InputBits {
    if (threatened && me.shieldHp > 1500) return Btn.Dodge;
    if (this.level.smart) {
      const grab = def.moves[MoveId.Grab]!;
      const inReach = seen.fighters.some((o, j) => j !== this.slot && o.action !== Action.Out && firstHit(me, grab, me.facing, 0, o, stage));
      if (inReach) return this.run(this.pressSeq(Btn.Dodge, Btn.Attack));
    }
    return 0;
  }

  // ---- Recovering, respawning, grabs ----

  /** Get back to the stage: drift in, jump when falling, then the specials that go up or across. */
  private recover(me: FighterState, def: FighterDef, ext: Extents): InputBits {
    const side = me.x < 0 ? -1 : 1;
    const under = me.x > ext.left && me.x < ext.right;
    const hold = this.towardStage(me, ext);
    if (me.action !== Action.Air) return hold;
    const out = side > 0 ? me.x - ext.right : ext.left - me.x; // distance past the edge
    const falling = me.vy >= 0;
    const used = (move: number) => (me.oncePerAirUsed >> move) & 1;
    const rec = recoveryMoves(def);
    if (!falling) return hold;
    if (me.jumpsLeft > 0 && (me.y > ext.top - px(50) || out > px(220))) return this.run(this.pressSeq(hold, Btn.Jump));
    if (under) return hold;
    if (rec.side && !used(MoveId.SideSpecial) && out > px(110) && me.y < ext.top + px(30)) {
      return this.run(this.pressSeq(xBit(-side), Btn.Special));
    }
    if (rec.down && !used(MoveId.DownSpecial)) return this.run(this.pressSeq(Btn.Down, Btn.Special));
    if (me.y > ext.top - px(30) || out > px(150)) return this.run(this.pressSeq(hold | Btn.Up, Btn.Special));
    return hold;
  }

  /** Hang a moment (mixing up the timing), then climb, jump, attack or roll onto the stage. */
  private onLedge(me: FighterState, stage: StageDef): InputBits {
    if (this.ledgeWait < 0) this.ledgeWait = LEDGE_ACTIONABLE + this.rand(this.level.reaction + 10);
    if (--this.ledgeWait > 0) return 0;
    const toward = xBit(-ledgeOf(stage, me.ledge).side);
    const r = this.rand(100);
    const button = r < 40 ? toward : r < 60 ? Btn.Jump : r < 80 ? Btn.Attack : Btn.Dodge;
    return this.run(this.pressSeq(0, button));
  }

  /** Toward the middle of the stage; out from under it first if it's below. */
  private towardStage(me: FighterState, ext: Extents): InputBits {
    const under = me.x > ext.left && me.x < ext.right && me.y > ext.top + px(4);
    if (under) return xBit(me.x < (ext.left + ext.right) / 2 ? -1 : 1);
    return xBit((ext.left + ext.right) / 2 - me.x);
  }

  /** Float at the respawn point a moment, then drop. */
  private respawn(me: FighterState): InputBits {
    if (this.respawnWait < 0) this.respawnWait = 10 + this.rand(this.level.reaction * 2 + 1);
    if (--this.respawnWait > 0) return 0;
    return xBit(-me.x) || Btn.Down;
  }

  /** Wiggle left and right to break out of a grab. */
  private mash(): InputBits {
    if (!this.chance(this.level.mash)) return 0;
    return this.prev & Btn.Left ? Btn.Right : Btn.Left;
  }

  /** Pummel a little, then throw toward the nearer edge (up from the middle). */
  private holding(me: FighterState): InputBits {
    if (this.pummels < 0) this.pummels = this.level.smart ? 1 : this.rand(2);
    if (this.pummels > 0) {
      this.pummels--;
      return this.run(this.pressSeq(0, Btn.Attack));
    }
    if (Math.abs(me.x) < px(80)) return Btn.Up;
    return xBit(me.x >= 0 ? 1 : -1);
  }

  // ---- Input plumbing ----

  /** Frames that press `buttons` fresh while holding `hold`: let go first if they're already down. */
  private pressSeq(hold: InputBits, buttons: InputBits): InputBits[] {
    return this.prev & buttons ? [hold & ~buttons, hold | buttons] : [hold | buttons];
  }

  /** Output the first frame now and queue the rest. */
  private run(frames: InputBits[]): InputBits {
    this.queue = frames.slice(1);
    return frames[0]!;
  }

  private rand(n: number): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return (x >>> 0) % n;
  }

  private chance(p: number): boolean {
    return this.rand(1000) < p * 1000;
  }
}
