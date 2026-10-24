import { defeatPose, idlePose, victoryPose } from '../render/animations';
import { fighterColor, slotColor } from '../render/renderer';
import { tint } from '../render/skeleton';
import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { DRAW, matchWinner } from '../sim/outcome';
import { DEFAULT_STOCKS } from '../sim/rules';
import type { OnlineLink } from '../net/online';
import type { MatchSetup, MatchState } from '../sim/state';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, drawMenu, panel, text, type View } from './draw';
import { MenuList } from './menuModel';
import { playerLabel } from './players';

export interface MatchResult {
  mode: Mode;
  chars: number[];
  /** Winning slot, or DRAW. */
  winner: number;
  /** Finishing place per slot (1 = winner); fighters knocked out on the same frame share one. */
  places: number[];
  stocksLeft: number[];
  falls: number[];
  kos: number[];
  damageDealt: number[];
  seconds: number;
  /** Where it was played (rematches stay there). */
  stageId: number;
}

/**
 * Per-player tallies kept while a match runs, read from each frame's state
 * change: damage dealt and KOs (credited to `lastHitBy`), and when each
 * player ran out of stocks.
 */
export class MatchStats {
  readonly damageDealt: number[];
  readonly kos: number[];
  /** Frame each player went out, or -1 while still in. */
  readonly outFrame: number[];

  constructor(players: number) {
    this.damageDealt = new Array<number>(players).fill(0);
    this.kos = new Array<number>(players).fill(0);
    this.outFrame = new Array<number>(players).fill(-1);
  }

  onStep(prev: MatchState, next: MatchState): void {
    next.fighters.forEach((f, i) => {
      const before = prev.fighters[i]!;
      const by = f.lastHitBy;
      const taken = f.damage - before.damage;
      if (taken > 0 && by >= 0 && by !== i) this.damageDealt[by]! += taken;
      if (f.stocks < before.stocks && by >= 0 && by !== i) this.kos[by]!++;
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
    kos: [...stats.kos],
    damageDealt: [...stats.damageDealt],
    seconds: Math.floor(final.frame / 60),
    stageId: final.stageId,
  };
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

export class ResultsScreen implements Screen {
  private items: readonly string[];
  private list: MenuList;
  private frame = 0;
  /** Online: the room, and who has asked for a rematch. */
  private link: OnlineLink | null;
  private wantRematch = [false, false];

  /** `fromReplay`: back from watching the replay, so no input delay and the cursor stays put. */
  constructor(
    private app: App,
    readonly result: MatchResult,
    fromReplay = false,
  ) {
    this.link = result.mode === 'online' ? app.online : null;
    this.items = this.link ? ONLINE_ITEMS : ITEMS;
    this.list = new MenuList(this.items.length);
    if (fromReplay) {
      this.frame = INPUT_DELAY;
      this.list.index = WATCH_REPLAY;
    }
    if (this.link) this.listen(this.link);
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

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    beginLayout(ctx, view, W, H);
    const r = this.result;

    const title = r.winner === DRAW ? 'DRAW!' : `${this.label(r.winner)} WINS!`;
    const titleColor = r.winner === DRAW ? '#ffffff' : slotColor(r.winner);
    text(ctx, title, W / 2, 84, { size: 64, bold: true, align: 'center', color: titleColor, outline: true });
    const mins = Math.floor(r.seconds / 60);
    const secs = String(r.seconds % 60).padStart(2, '0');
    text(ctx, `Match time ${mins}:${secs}`, W / 2, 114, { size: 15, align: 'center', color: '#d9c49a' });

    if (r.chars.length <= 2) r.chars.forEach((charId, slot) => this.drawWide(ctx, charId, slot, t));
    else r.chars.forEach((charId, slot) => this.drawNarrow(ctx, charId, slot, t));

    if (this.frame >= INPUT_DELAY) drawMenu(ctx, this.items, this.list.index, W / 2, 516, 320, 48);
    if (this.link) {
      const me = this.link.slot, them = 1 - me;
      const note = this.wantRematch[me]
        ? `Waiting for ${this.label(them)} to accept the rematch…`
        : this.wantRematch[them]
          ? `${this.label(them)} wants a rematch!`
          : `Online · room ${this.link.code} · you are ${this.label(me)}`;
      text(ctx, note, W / 2, 700, { size: 17, bold: this.wantRematch[them], align: 'center', color: '#ffd166', outline: true });
    }
  }

  private pose(slot: number) {
    const r = this.result;
    if (r.winner === DRAW) return idlePose(this.frame);
    return slot === r.winner ? victoryPose(this.frame) : defeatPose(this.frame);
  }

  /** One of two side-by-side panels (1v1). */
  private drawWide(ctx: CanvasRenderingContext2D, charId: number, slot: number, t: number): void {
    const r = this.result;
    const cx = slot === 0 ? 290 : 810;
    const won = slot === r.winner;
    const color = fighterColor(r.chars, slot);
    panel(ctx, cx - 210, 140, 420, 360, won ? slotColor(slot) : undefined);
    drawFigure(ctx, charId, color, cx - 90, 420, won ? 2.1 : 1.8, slot === 0 ? 1 : -1, this.pose(slot), t, won || r.winner === DRAW ? 1 : 0.75);

    const tx = cx + 10;
    text(ctx, this.label(slot), tx, 190, { size: 18, bold: true, color: slotColor(slot) });
    text(ctx, FIGHTERS[charId]!.name, tx, 228, { size: 30, bold: true, color: tint(color, 0.35), outline: true });
    this.statLines(slot).forEach((l, i) => text(ctx, l, tx, 276 + i * 30, { size: 18, color: '#f1e4c8' }));
    if (won) text(ctx, '★ WINNER', tx, 420, { size: 20, bold: true, color: '#ffd166' });
  }

  /** One of three or four panels in a row, each with its finishing place. */
  private drawNarrow(ctx: CanvasRenderingContext2D, charId: number, slot: number, t: number): void {
    const r = this.result;
    const n = r.chars.length;
    const gap = 16;
    const w = (W - 40 - (n - 1) * gap) / n;
    const x = 20 + slot * (w + gap);
    const won = slot === r.winner;
    const color = fighterColor(r.chars, slot);
    const place = r.places[slot]!;
    panel(ctx, x, 140, w, 360, won ? slotColor(slot) : undefined);

    text(ctx, PLACE_NAMES[place - 1]!, x + 16, 180, { size: 30, bold: true, color: PLACE_COLORS[place - 1], outline: true });
    text(ctx, this.label(slot), x + w - 16, 176, { size: 17, bold: true, align: 'right', color: slotColor(slot) });
    text(ctx, FIGHTERS[charId]!.name, x + w / 2, 214, { size: 24, bold: true, align: 'center', color: tint(color, 0.35), outline: true });
    drawFigure(ctx, charId, color, x + w / 2, 368, won ? 1.45 : 1.25, slot % 2 === 0 ? 1 : -1, this.pose(slot), t, won || r.winner === DRAW ? 1 : 0.75);
    this.statLines(slot).forEach((l, i) => text(ctx, l, x + w / 2, 400 + i * 23, { size: 15, align: 'center', color: '#f1e4c8' }));
  }

  private statLines(slot: number): string[] {
    const r = this.result;
    return [
      `Stocks left  ${r.stocksLeft[slot]}`,
      `Falls  ${r.falls[slot]}`,
      `KOs  ${r.kos[slot]}`,
      `Damage dealt  ${r.damageDealt[slot]}%`,
    ];
  }
}
