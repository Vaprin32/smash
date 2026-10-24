import { defeatPose, idlePose, victoryPose } from '../render/animations';
import { fighterColor, slotColor } from '../render/renderer';
import { tint } from '../render/skeleton';
import { Action } from '../sim/actions';
import { SimEvent } from '../sim/events';
import { FIGHTERS } from '../sim/fighters';
import { DRAW, matchWinner } from '../sim/outcome';
import { DEFAULT_STOCKS } from '../sim/rules';
import { STAGES } from '../sim/stage';
import type { OnlineLink } from '../net/online';
import type { MatchSetup, MatchState } from '../sim/state';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, drawMenu, panel, roundRect, text, type View } from './draw';
import { MenuList } from './menuModel';
import { isCpuSlot, playerLabel } from './players';

export interface MatchResult {
  mode: Mode;
  chars: number[];
  /** Winning slot, or DRAW. */
  winner: number;
  /** Finishing place per slot (1 = winner); fighters knocked out on the same frame share one. */
  places: number[];
  stocksLeft: number[];
  falls: number[];
  /** Falls nobody caused (walked or jumped off). */
  selfDestructs: number[];
  kos: number[];
  damageDealt: number[];
  damageTaken: number[];
  /** Times this player's attacks did damage. */
  hits: number[];
  /** Most damage done by one hit. */
  strongestHit: number[];
  /** Most hits in a row on someone before they got back to their feet. */
  longestCombo: number[];
  /** Highest damage % this player was at. */
  peakDamage: number[];
  /** Attacks this player caught on their shield. */
  shielded: number[];
  ledgeGrabs: number[];
  seconds: number;
  /** Where it was played (rematches stay there). */
  stageId: number;
}

/**
 * Per-player tallies kept while a match runs, read from each frame's state
 * change. Damage, hits and KOs are credited to the victim's `lastHitBy`.
 */
export class MatchStats {
  readonly damageDealt: number[];
  readonly damageTaken: number[];
  readonly kos: number[];
  readonly selfDestructs: number[];
  readonly hits: number[];
  readonly strongestHit: number[];
  readonly longestCombo: number[];
  readonly peakDamage: number[];
  readonly shielded: number[];
  readonly ledgeGrabs: number[];
  /** Frame each player went out, or -1 while still in. */
  readonly outFrame: number[];
  /** Per victim: hits in the combo they're in right now, and who is doing it. */
  private comboRun: number[];
  private comboBy: number[];

  constructor(players: number) {
    const zeros = () => new Array<number>(players).fill(0);
    this.damageDealt = zeros();
    this.damageTaken = zeros();
    this.kos = zeros();
    this.selfDestructs = zeros();
    this.hits = zeros();
    this.strongestHit = zeros();
    this.longestCombo = zeros();
    this.peakDamage = zeros();
    this.shielded = zeros();
    this.ledgeGrabs = zeros();
    this.comboRun = zeros();
    this.outFrame = new Array<number>(players).fill(-1);
    this.comboBy = new Array<number>(players).fill(-1);
  }

  onStep(prev: MatchState, next: MatchState): void {
    next.fighters.forEach((f, i) => {
      const before = prev.fighters[i]!;
      const by = f.lastHitBy;
      const taken = f.damage - before.damage;
      if (taken > 0) {
        this.damageTaken[i]! += taken;
        if (by >= 0 && by !== i) {
          this.damageDealt[by]! += taken;
          this.hits[by]!++;
          this.strongestHit[by] = Math.max(this.strongestHit[by]!, taken);
          // Still reeling (or held) from the last hit: the combo goes on.
          const reeling = before.action === Action.Hitstun || before.action === Action.Held || before.hitstun > 0;
          if (reeling && this.comboBy[i] === by) this.comboRun[i]!++;
          else {
            this.comboRun[i] = 1;
            this.comboBy[i] = by;
          }
          this.longestCombo[by] = Math.max(this.longestCombo[by]!, this.comboRun[i]!);
        }
      }
      this.peakDamage[i] = Math.max(this.peakDamage[i]!, f.damage);
      if (f.event === SimEvent.ShieldHit || f.event === SimEvent.Parry) this.shielded[i]!++;
      if (f.action === Action.LedgeHang && before.action !== Action.LedgeHang) this.ledgeGrabs[i]!++;
      if (f.stocks < before.stocks) {
        if (by >= 0 && by !== i) this.kos[by]!++;
        else this.selfDestructs[i]!++;
      }
      if (f.action === Action.Out && before.action !== Action.Out) this.outFrame[i] = next.frame;
    });
  }
}

/** The result of a match that ended in `final`. */
export function matchResult(mode: Mode, chars: readonly number[], final: MatchState, stats: MatchStats): MatchResult {
  // Later out = better; still in = best.
  const rank = (i: number) => (stats.outFrame[i]! < 0 ? Infinity : stats.outFrame[i]!);
  return {
    mode,
    chars: [...chars],
    winner: matchWinner(final),
    places: chars.map((_, i) => 1 + chars.filter((_c, j) => rank(j) > rank(i)).length),
    stocksLeft: final.fighters.map((f) => f.stocks),
    falls: final.fighters.map((f) => DEFAULT_STOCKS - f.stocks),
    selfDestructs: [...stats.selfDestructs],
    kos: [...stats.kos],
    damageDealt: [...stats.damageDealt],
    damageTaken: [...stats.damageTaken],
    hits: [...stats.hits],
    strongestHit: [...stats.strongestHit],
    longestCombo: [...stats.longestCombo],
    peakDamage: [...stats.peakDamage],
    shielded: [...stats.shielded],
    ledgeGrabs: [...stats.ledgeGrabs],
    seconds: Math.floor(final.frame / 60),
    stageId: final.stageId,
  };
}

interface StatRow {
  label: string;
  values: (r: MatchResult) => number[];
  /** Which end of the row is best. */
  best: 'high' | 'low';
  show?: (v: number, slot: number, r: MatchResult) => string;
}

export const STAT_ROWS: readonly StatRow[] = [
  { label: 'KOs', values: (r) => r.kos, best: 'high' },
  {
    label: 'Falls',
    values: (r) => r.falls,
    best: 'low',
    show: (v, slot, r) => (r.selfDestructs[slot]! > 0 ? `${v} (${r.selfDestructs[slot]} SD)` : String(v)),
  },
  { label: 'Damage dealt', values: (r) => r.damageDealt, best: 'high', show: (v) => `${v}%` },
  { label: 'Damage taken', values: (r) => r.damageTaken, best: 'low', show: (v) => `${v}%` },
  { label: 'Hits landed', values: (r) => r.hits, best: 'high' },
  { label: 'Strongest hit', values: (r) => r.strongestHit, best: 'high', show: (v) => `${v}%` },
  { label: 'Longest combo', values: (r) => r.longestCombo, best: 'high', show: (v) => (v === 1 ? '1 hit' : `${v} hits`) },
  { label: 'Highest damage', values: (r) => r.peakDamage, best: 'low', show: (v) => `${v}%` },
  { label: 'Attacks shielded', values: (r) => r.shielded, best: 'high' },
  { label: 'Ledge grabs', values: (r) => r.ledgeGrabs, best: 'high' },
];

interface Award {
  name: string;
  values: (r: MatchResult) => number[];
  best: 'high' | 'low';
  /** The best value must be at least this. */
  min: number;
}

/** Each player gets the first of these they alone are best at (one award each at most). */
const AWARDS: readonly Award[] = [
  { name: 'Most KOs', values: (r) => r.kos, best: 'high', min: 1 },
  { name: 'Heavy Hitter', values: (r) => r.strongestHit, best: 'high', min: 12 },
  { name: 'Combo Artist', values: (r) => r.longestCombo, best: 'high', min: 3 },
  { name: 'Untouchable', values: (r) => r.damageTaken, best: 'low', min: 0 },
  { name: 'Iron Wall', values: (r) => r.shielded, best: 'high', min: 3 },
  { name: 'Busy Fists', values: (r) => r.hits, best: 'high', min: 5 },
  { name: 'Ledge Lord', values: (r) => r.ledgeGrabs, best: 'high', min: 3 },
];

/** The slot that alone has the best value of `values`, or -1 for a tie. */
function soleBest(values: number[], best: 'high' | 'low'): number {
  const target = best === 'high' ? Math.max(...values) : Math.min(...values);
  const at = values.flatMap((v, i) => (v === target ? [i] : []));
  return at.length === 1 ? at[0]! : -1;
}

/** One award (or none) per player. */
export function awardsFor(r: MatchResult): (string | null)[] {
  const out: (string | null)[] = r.chars.map(() => null);
  for (const a of AWARDS) {
    const values = a.values(r);
    const slot = soleBest(values, a.best);
    if (slot < 0 || out[slot]) continue;
    const v = values[slot]!;
    if (a.best === 'high' ? v < a.min : r.seconds < 20) continue;
    out[slot] = a.name;
  }
  return out;
}

const PLACE_NAMES = ['1st', '2nd', '3rd', '4th'];
const PLACE_COLORS = ['#ffd166', '#d8dde6', '#d08a4e', '#9a8f80'];

const ITEMS = ['Rematch', 'Watch replay', 'Character select', 'Main menu'];
const WATCH_REPLAY = 1;
/** Ignore input briefly so buttons mashed at the end of the match don't pick an option. */
const INPUT_DELAY = 45;
const W = 1100;
const H = 720;

/** Online there is no replay here (it's in the main menu afterwards): both players stay on this screen. */
const ONLINE_ITEMS = ['Rematch', 'Character select', 'Leave room'];

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  color: string;
  size: number;
}

export class ResultsScreen implements Screen {
  private items: readonly string[];
  private list: MenuList;
  private frame = 0;
  /** Online: the room, and who has asked for a rematch. */
  private link: OnlineLink | null;
  private wantRematch = [false, false];
  private awards: (string | null)[];
  private confetti: Confetti[] = [];

  /** `fromReplay`: back from watching the replay, so no input delay and the cursor stays put. */
  constructor(
    private app: App,
    readonly result: MatchResult,
    fromReplay = false,
  ) {
    this.link = result.mode === 'online' ? app.online : null;
    this.items = this.link ? ONLINE_ITEMS : ITEMS;
    this.list = new MenuList(this.items.length);
    this.awards = awardsFor(result);
    if (fromReplay) {
      this.frame = INPUT_DELAY;
      this.list.index = WATCH_REPLAY;
    }
    if (this.link) this.listen(this.link);
    if (result.winner !== DRAW && !fromReplay) this.burst();
  }

  /** The human on this machine, when there is exactly one (vs CPU, training, online). */
  private get you(): number {
    const r = this.result;
    if (this.link) return this.link.slot;
    if (r.chars.some((_, slot) => isCpuSlot(r.mode, slot))) return 0;
    return -1;
  }

  private burst(): void {
    const colors = ['#ffd166', '#fff3c4', slotColor(this.result.winner), tint(fighterColor(this.result.chars, this.result.winner), 0.3)];
    for (let i = 0; i < 140; i++) {
      this.confetti.push({
        x: Math.random() * W,
        y: -20 - Math.random() * 500,
        vx: (Math.random() - 0.5) * 0.06,
        vy: 0.08 + Math.random() * 0.12,
        spin: (Math.random() - 0.5) * 0.02,
        angle: Math.random() * Math.PI,
        color: colors[i % colors.length]!,
        size: 4 + Math.random() * 5,
      });
    }
  }

  private listen(link: OnlineLink): void {
    link.listen((msg) => {
      if (msg.t === 'rematch') {
        this.wantRematch[1 - link.slot] = true;
        this.app.sfx.select();
        this.maybeRematch(link);
      } else if (msg.t === 'select') {
        this.app.toCharSelect('online', this.result.chars);
      } else if (msg.t === 'start' && !link.isHost) {
        this.app.startOnlineMatch(msg.setup, msg.match, 0);
      }
    });
  }

  /** Host: once both asked, start the rematch (same fighters, new seed). */
  private maybeRematch(link: OnlineLink): void {
    if (!link.isHost || !this.wantRematch.every(Boolean)) return;
    const setup: MatchSetup = { seed: (Math.random() * 0x100000000) >>> 0, stageId: this.result.stageId, chars: this.result.chars, stocks: DEFAULT_STOCKS };
    const match = link.nextMatch();
    link.send({ t: 'start', match, setup });
    this.app.startOnlineMatch(setup, match, Math.max(0, link.rttMs / 2));
  }

  private tickOnline(link: OnlineLink): void {
    const c = this.app.controls;
    if (c.backKey) return this.app.leaveOnline();
    const event = this.list.update([c.menu(0)], c.confirmKey || c.startButton, false);
    if (event === 'move') this.app.sfx.move();
    if (event !== 'choose') return;
    this.app.sfx.select();
    const item = this.items[this.list.index];
    if (item === 'Rematch') {
      if (this.wantRematch[link.slot]) return;
      this.wantRematch[link.slot] = true;
      link.send({ t: 'rematch' });
      this.maybeRematch(link);
    } else if (item === 'Character select') {
      link.send({ t: 'select' });
      this.app.toCharSelect('online', this.result.chars);
    } else {
      this.app.leaveOnline();
    }
  }

  private label(slot: number): string {
    return playerLabel(this.result.mode, slot, this.result.chars.length);
  }

  tick(): void {
    this.frame++;
    if (this.frame < INPUT_DELAY) return;
    if (this.link) return this.tickOnline(this.link);
    const c = this.app.controls;
    const r = this.result;
    const event = this.list.update([c.menu(0), c.menu(1)], c.confirmKey || c.startButton, c.backKey);
    if (event === 'move') this.app.sfx.move();
    if (event === 'back') {
      this.app.sfx.back();
      this.app.toCharSelect(r.mode, r.chars);
    }
    if (event !== 'choose') return;
    this.app.sfx.select();
    if (this.list.index === 0) this.app.startMatch(r.mode, r.chars);
    else if (this.list.index === WATCH_REPLAY) this.app.watchReplay(() => this.app.toResults(r, true));
    else if (this.list.index === 2) this.app.toCharSelect(r.mode, r.chars);
    else this.app.toMainMenu();
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs = 16): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    const area = beginLayout(ctx, view, W, H);
    ctx.fillStyle = 'rgba(10,6,14,0.35)';
    ctx.fillRect(area.left, area.top, area.width, area.height);
    const r = this.result;

    this.drawConfetti(ctx, dtMs); // behind the panels, so it never covers text
    this.drawTitle(ctx);
    r.chars.forEach((charId, slot) => this.drawCard(ctx, charId, slot, t));
    this.drawStats(ctx);
    const menuReady = this.frame >= INPUT_DELAY;
    if (menuReady) drawMenu(ctx, this.items, this.list.index, 900, 368, 300, 50);
    if (this.link) {
      const me = this.link.slot, them = 1 - me;
      const note = this.wantRematch[me]
        ? `Waiting for ${this.label(them)} to accept the rematch…`
        : this.wantRematch[them]
          ? `${this.label(them)} wants a rematch!`
          : `Online · room ${this.link.code} · you are ${this.label(me)}`;
      text(ctx, note, 900, 600, { size: 15, bold: this.wantRematch[them], align: 'center', color: '#ffd166', outline: true });
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const r = this.result;
    const you = this.you;
    let title: string, color: string;
    if (r.winner === DRAW) [title, color] = ['DRAW!', '#ffffff'];
    else if (you >= 0) [title, color] = r.winner === you ? ['VICTORY!', '#ffd166'] : ['DEFEAT', '#c9b2b2'];
    else [title, color] = [`${this.label(r.winner)} WINS!`, slotColor(r.winner)];
    // Pops in, then settles.
    const k = Math.min(1, this.frame / 18);
    const scale = 1 + (1 - k) * 0.6 + Math.sin(Math.min(1, this.frame / 30) * Math.PI) * 0.06;
    ctx.save();
    ctx.translate(W / 2, 70);
    ctx.scale(scale, scale);
    ctx.globalAlpha = k;
    if (r.winner !== DRAW && !(you >= 0 && r.winner !== you)) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
    }
    text(ctx, title, 0, 0, { size: 62, bold: true, align: 'center', color, outline: true });
    ctx.restore();

    const mins = Math.floor(r.seconds / 60);
    const secs = String(r.seconds % 60).padStart(2, '0');
    const who = r.winner === DRAW ? 'Nobody wins' : `${FIGHTERS[r.chars[r.winner]!]!.name} (${this.label(r.winner)}) wins`;
    text(ctx, `${who} · ${STAGES[r.stageId]?.name ?? ''} · ${mins}:${secs}`, W / 2, 104, { size: 16, align: 'center', color: '#e6d6b0', outline: true });
  }

  private pose(slot: number) {
    const r = this.result;
    if (r.winner === DRAW) return idlePose(this.frame);
    return slot === r.winner ? victoryPose(this.frame) : defeatPose(this.frame);
  }

  /** One card per player: place, name, figure, award. The winner's glows. */
  private drawCard(ctx: CanvasRenderingContext2D, charId: number, slot: number, t: number): void {
    const r = this.result;
    const n = r.chars.length;
    const gap = 14;
    const cardW = (W - 40 - (n - 1) * gap) / n;
    const x = 20 + slot * (cardW + gap), y = 120, h = 212;
    const won = slot === r.winner;
    const color = fighterColor(r.chars, slot);
    panel(ctx, x, y, cardW, h, won ? '#ffd166' : slot === this.you ? slotColor(slot) : undefined);

    const cx = x + cardW / 2, feet = y + h - 30;
    const figX = cx + (n > 2 ? 0 : -cardW * 0.18);
    if (won) this.drawRays(ctx, figX, feet - 60, t);
    const scale = (won ? 1.5 : 1.25) * (n > 2 ? 0.85 : 1);
    drawFigure(ctx, charId, color, figX, feet, scale, slot % 2 === 0 ? 1 : -1, this.pose(slot), t, won || r.winner === DRAW ? 1 : 0.78);

    const place = r.places[slot]!;
    text(ctx, PLACE_NAMES[place - 1]!, x + 14, y + 34, { size: 28, bold: true, color: PLACE_COLORS[place - 1], outline: true });
    const tag = slot === this.you ? `${this.label(slot)} · YOU` : this.label(slot);
    text(ctx, tag, x + cardW - 14, y + 28, { size: 15, bold: true, align: 'right', color: slotColor(slot), outline: true });
    const nameX = n > 2 ? cx : x + cardW * 0.68;
    text(ctx, FIGHTERS[charId]!.name, nameX, n > 2 ? y + 62 : y + 92, { size: n > 2 ? 22 : 30, bold: true, align: 'center', color: tint(color, 0.35), outline: true });
    if (n <= 2) {
      text(ctx, `${r.kos[slot]} KO${r.kos[slot] === 1 ? '' : 's'} · ${r.falls[slot]} fall${r.falls[slot] === 1 ? '' : 's'}`, nameX, y + 122, {
        size: 17,
        align: 'center',
        color: '#f1e4c8',
      });
    }
    const award = this.awards[slot];
    if (award) this.drawRibbon(ctx, n > 2 ? cx : nameX, n > 2 ? y + h - 12 : y + 160, award);
  }

  private drawRays(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.0003);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      const g = ctx.createLinearGradient(0, 0, 0, -120);
      g.addColorStop(0, 'rgba(255,209,102,0.28)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -120);
      ctx.lineTo(12, -120);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRibbon(ctx: CanvasRenderingContext2D, cx: number, y: number, label: string): void {
    ctx.font = `bold 13px serif`;
    const w = ctx.measureText(label).width + 34;
    ctx.fillStyle = '#7a1f22';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 10, y - 11);
    ctx.lineTo(cx + w / 2 + 10, y - 11);
    ctx.lineTo(cx + w / 2 + 2, y);
    ctx.lineTo(cx + w / 2 + 10, y + 11);
    ctx.lineTo(cx - w / 2 - 10, y + 11);
    ctx.lineTo(cx - w / 2 - 2, y);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, cx - w / 2, y - 13, w, 26, 4);
    ctx.fillStyle = '#a8322f';
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, `★ ${label}`, cx, y + 5, { size: 13, bold: true, align: 'center', color: '#fff3c4' });
  }

  /** The stats table: one column per player, the best in each row in gold. */
  private drawStats(ctx: CanvasRenderingContext2D): void {
    const r = this.result;
    const n = r.chars.length;
    const x = 20, y = 346, w = 690, rowH = 24;
    panel(ctx, x, y, w, 46 + STAT_ROWS.length * rowH);
    const labelW = 190;
    const colW = (w - labelW - 20) / n;
    const colX = (slot: number) => x + labelW + colW * slot + colW / 2;
    text(ctx, 'Match stats', x + 16, y + 28, { size: 18, bold: true, color: '#ffd166' });
    r.chars.forEach((_, slot) => text(ctx, this.label(slot), colX(slot), y + 28, { size: 15, bold: true, align: 'center', color: slotColor(slot) }));
    STAT_ROWS.forEach((row, i) => {
      const ry = y + 52 + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 8, ry - 16, w - 16, rowH);
      }
      text(ctx, row.label, x + 16, ry, { size: 15, color: '#e6d6b0' });
      const values = row.values(r);
      const best = soleBest(values, row.best);
      values.forEach((v, slot) => {
        const shown = row.show ? row.show(v, slot, r) : String(v);
        const top = slot === best;
        text(ctx, top ? `${shown} ★` : shown, colX(slot), ry, { size: 15, bold: top, align: 'center', color: top ? '#ffd166' : '#ffffff' });
      });
    });
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, dtMs: number): void {
    const dt = Math.min(dtMs, 50);
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.spin * dt;
      if (c.y > H + 20) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.scale(1, Math.abs(Math.cos(c.angle * 2)) * 0.8 + 0.2);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    }
    this.confetti = this.confetti.filter((c) => c.y <= H + 20);
  }
}
