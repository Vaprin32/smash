import { CPU_LEVELS } from '../ai/levels';
import type { MenuPress } from '../input/controls';
import { keysSummary } from '../input/keyLabels';
import type { OnlineLink } from '../net/online';
import { idlePose } from '../render/animations';
import { fighterColor, lookOf, slotColor } from '../render/renderer';
import { tint } from '../render/skeleton';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { MoveId } from '../sim/moves/types';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, panel, roundRect, text, type View } from './draw';
import { CharSelectModel, GRID_COLS } from './menuModel';
import { isCpuSlot, playerLabel } from './players';

const W = 1100;
const H = 760;
const CELL_W = 150;
const CELL_H = 160;
const GAP = 14;
const GRID_TOP = 84;
const TITLES: Record<Mode, string> = { cpu: 'Versus CPU', training: 'Training', online: 'Online' };
const SUBTITLES: Record<Mode, string> = {
  cpu: "Pick your fighter, then each CPU's (they start on random fighters)",
  training: "Pick your fighter, then the CPU's",
  online: 'Both players pick a fighter · the match starts once both are locked in',
};
/** Online: resend our cursor this often, so the other player's view can't stay stale. */
const CURSOR_RESEND_TICKS = 30;
/** Online: once both are locked in, the host goes on to stage select after this many ticks. */
const ONLINE_START_TICKS = 45;
const NO_PRESS: MenuPress = { up: false, down: false, left: false, right: false, confirm: false, back: false };

interface StatBar {
  label: string;
  /** 0..1 across the roster. */
  value: number;
}

/** Preview bars, each scaled between the roster's lowest and highest value. */
const STAT_BARS: StatBar[][] = (() => {
  const raw = FIGHTERS.map((def) => {
    const st = def.stats;
    const smash = def.moves[MoveId.FSmash]!.hitboxes[0]!;
    const height = (v: number) => (v / ONE) ** 2 / ((2 * st.gravity) / ONE);
    return {
      Power: smash.damage * (smash.baseKb + smash.kbGrowth),
      Speed: st.runSpeed,
      Weight: st.weight,
      Jump: height(st.fullHopSpeed) + st.airJumps * height(st.doubleJumpSpeed),
    };
  });
  const keys = Object.keys(raw[0]!) as (keyof (typeof raw)[0])[];
  return raw.map((r) =>
    keys.map((k) => {
      const vals = raw.map((x) => x[k]);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return { label: k, value: 0.15 + (0.85 * (r[k] - lo)) / (hi - lo || 1) };
    }),
  );
})();

function cellRect(index: number): { x: number; y: number } {
  const cols = GRID_COLS;
  const gridW = cols * CELL_W + (cols - 1) * GAP;
  const left = (W - gridW) / 2;
  return { x: left + (index % cols) * (CELL_W + GAP), y: GRID_TOP + Math.floor(index / cols) * (CELL_H + GAP) };
}

export class CharSelectScreen implements Screen {
  private model: CharSelectModel;
  private frame = 0;
  /** Online: the room, what we last told the peer about our cursor, and ticks since both locked in. */
  private link: OnlineLink | null;
  private sent = '';
  private readyTicks = 0;

  constructor(
    private app: App,
    readonly mode: Mode,
    chars?: readonly number[],
  ) {
    this.model = new CharSelectModel(mode, FIGHTERS.length, chars ?? (mode === 'cpu' ? cpuStart(app.cpu.opponents) : [0, 1]));
    this.link = mode === 'online' ? app.online : null;
    if (this.link) this.listen(this.link);
  }

  private listen(link: OnlineLink): void {
    link.listen((msg) => {
      if (msg.t === 'cursor') {
        const index = msg.index | 0;
        if (index >= 0 && index < FIGHTERS.length) this.model.cursors[1 - link.slot] = { index, locked: msg.locked === true };
      } else if (msg.t === 'start' && !link.isHost) {
        this.app.sfx.go();
        this.app.startOnlineMatch(msg.setup, msg.match, 0);
      }
    });
  }

  /** Online: drive our own cursor only, keep the peer posted, and (host) start once both are in. */
  private tickOnline(link: OnlineLink): void {
    const c = this.app.controls;
    const sfx = this.app.sfx;
    if (c.backKey) {
      sfx.back();
      return this.app.leaveOnline();
    }
    const mine = { ...c.menu(0) };
    mine.confirm ||= c.confirmKey || c.startButton;
    const presses = link.slot === 0 ? [mine, NO_PRESS] : [NO_PRESS, mine];
    const event = this.model.update(presses, false, false);
    if (event === 'move') sfx.move();
    else if (event === 'lock') sfx.select();
    else if (event === 'unlock') sfx.back();
    else if (event === 'exit') {
      sfx.back();
      return this.app.leaveOnline();
    }

    const cur = this.model.cursors[link.slot]!;
    const state = `${cur.index}:${cur.locked}`;
    if (state !== this.sent || this.frame % CURSOR_RESEND_TICKS === 0) {
      link.send({ t: 'cursor', index: cur.index, locked: cur.locked });
      this.sent = state;
    }

    this.readyTicks = this.model.ready ? this.readyTicks + 1 : 0;
    // The host picks the stage; the guest waits here for the start.
    if (link.isHost && this.readyTicks === ONLINE_START_TICKS) {
      sfx.select();
      this.app.toStageSelect('online', this.model.cursors.map((cur) => cur.index));
    }
  }

  tick(): void {
    this.frame++;
    if (this.link) return this.tickOnline(this.link);
    const c = this.app.controls;
    const sfx = this.app.sfx;
    switch (this.model.update([c.menu(0), c.menu(1)], c.confirmKey || c.startButton, c.backKey)) {
      case 'move':
        sfx.move();
        break;
      case 'lock':
        sfx.select();
        break;
      case 'unlock':
        sfx.back();
        break;
      case 'exit':
        sfx.back();
        if (this.mode === 'cpu') this.app.toCpuSetup();
        else this.app.toMainMenu();
        break;
      case 'start':
        sfx.go();
        this.app.toStageSelect(this.mode, this.model.cursors.map((cur) => cur.index));
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    beginLayout(ctx, view, W, H);
    const chars = this.model.cursors.map((c) => c.index);

    text(ctx, TITLES[this.mode], W / 2, 46, { size: 34, bold: true, align: 'center', color: '#ffd166', outline: true });
    const room = this.link ? ` · room ${this.link.code}${this.link.rttMs >= 0 ? ` · ping ${Math.round(this.link.rttMs)} ms` : ''}` : '';
    text(ctx, SUBTITLES[this.mode] + room, W / 2, 72, {
      size: 15,
      align: 'center',
      color: '#d9c49a',
    });

    // Grid. Every fighter is drawn at the same scale, so sizes compare.
    FIGHTERS.forEach((_def, i) => {
      const { x, y } = cellRect(i);
      panel(ctx, x, y, CELL_W, CELL_H);
      drawFigure(ctx, i, lookOf(i).body, x + CELL_W / 2, y + CELL_H - 34, 1.1, 1, idlePose(this.frame + i * 13), t);
    });
    this.model.cursors.forEach((cur, slot) => {
      const { x, y } = cellRect(cur.index);
      const inset = slot * 6;
      roundRect(ctx, x + inset, y + inset, CELL_W - inset * 2, CELL_H - inset * 2, 12);
      ctx.lineWidth = 4;
      ctx.strokeStyle = slotColor(slot);
      ctx.stroke();
      const label = `${cur.locked ? '✓ ' : ''}${this.playerLabel(slot)}`;
      ctx.font = `bold 14px system-ui, sans-serif`;
      const bw = ctx.measureText(label).width + 14;
      // P1 and P2 on the top corners, P3 and P4 just under them (clear of the name).
      const bx = slot % 2 === 0 ? x - 4 : x + CELL_W - bw + 4;
      const by = slot < 2 ? y - 10 : y + 16;
      roundRect(ctx, bx, by, bw, 22, 8);
      ctx.fillStyle = slotColor(slot);
      ctx.fill();
      text(ctx, label, bx + bw / 2, by + 16, { size: 14, bold: true, align: 'center' });
    });
    // Names on top of the cursor rings.
    FIGHTERS.forEach((def, i) => {
      const { x, y } = cellRect(i);
      text(ctx, def.name, x + CELL_W / 2, y + CELL_H - 12, { size: 16, bold: true, align: 'center', outline: true });
    });

    // One preview panel per player: wide ones for two, narrow ones for three or four.
    const top = GRID_TOP + 2 * CELL_H + GAP + 18;
    const n = this.model.cursors.length;
    this.model.cursors.forEach((cur, slot) => {
      if (n <= 2) this.drawPreview(ctx, slot, cur.index, chars, 30 + slot * 530, top, t);
      else this.drawSmallPreview(ctx, slot, cur.index, chars, top, t);
    });

    const footY = 742;
    if (this.link) {
      const footer = this.model.ready
        ? this.link.isHost
          ? 'Both ready! Choosing the stage…'
          : 'Both ready! P1 is choosing the stage…'
        : this.model.cursors[this.link.slot]!.locked
          ? 'Waiting for the other player… · Special: undo · Esc: leave the room'
          : 'Attack / Jump: lock in · Esc: leave the room';
      text(ctx, footer, W / 2, footY, { size: this.model.ready ? 22 : 15, bold: this.model.ready, align: 'center', color: this.model.ready ? '#ffd166' : 'rgba(255,255,255,0.75)', outline: this.model.ready });
    } else if (this.model.ready) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.008);
      ctx.globalAlpha = pulse;
      text(ctx, 'Ready! Press Attack, Enter or Start to fight', W / 2, footY, { size: 22, bold: true, align: 'center', color: '#ffd166', outline: true });
      ctx.globalAlpha = 1;
    } else {
      text(ctx, 'Attack / Jump: lock in · Special: undo · Esc: back · pad View button: switch player', W / 2, footY, {
        size: 14,
        align: 'center',
        color: 'rgba(255,255,255,0.6)',
      });
    }
  }

  private playerLabel(slot: number): string {
    return playerLabel(this.mode, slot, this.model.cursors.length);
  }

  private isActive(slot: number): boolean {
    return this.model.activeCursor(0) === slot || this.model.activeCursor(slot) === slot;
  }

  /** A narrow preview (three or four players): name, figure and stat bars stacked. */
  private drawSmallPreview(ctx: CanvasRenderingContext2D, slot: number, charId: number, chars: readonly number[], y: number, t: number): void {
    const n = this.model.cursors.length;
    const gap = 16;
    const w = (W - 60 - (n - 1) * gap) / n, h = 270;
    const x = 30 + slot * (w + gap);
    const cur = this.model.cursors[slot]!;
    panel(ctx, x, y, w, h, cur.locked || this.isActive(slot) ? slotColor(slot) : undefined);

    const def = FIGHTERS[charId]!;
    const color = fighterColor(chars, slot);
    text(ctx, this.playerLabel(slot), x + 14, y + 26, { size: 15, bold: true, color: slotColor(slot) });
    if (cur.locked) text(ctx, 'READY', x + w - 14, y + 26, { size: 16, bold: true, align: 'right', color: slotColor(slot), outline: true });
    text(ctx, def.name, x + w / 2, y + 56, { size: 24, bold: true, align: 'center', color: tint(color, 0.35), outline: true });
    text(ctx, lookOf(charId).title, x + w / 2, y + 76, { size: 13, bold: true, align: 'center', color: '#ffd166' });
    drawFigure(ctx, charId, color, x + w / 2, y + 180, 1.05, slot % 2 === 0 ? 1 : -1, idlePose(this.frame), t);

    const barX = x + 66, barW = w - 80;
    STAT_BARS[charId]!.forEach((bar, i) => {
      const by = y + 192 + i * 16;
      text(ctx, bar.label, x + 14, by + 10, { size: 12, color: '#d9c49a' });
      roundRect(ctx, barX, by, barW, 10, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      roundRect(ctx, barX, by, Math.max(10, barW * bar.value), 10, 5);
      ctx.fillStyle = color;
      ctx.fill();
    });
    text(ctx, this.deviceLine(slot), x + w / 2, y + h - 9, { size: 11, align: 'center', color: 'rgba(255,255,255,0.55)' });
  }

  private drawPreview(
    ctx: CanvasRenderingContext2D,
    slot: number,
    charId: number,
    chars: readonly number[],
    x: number,
    y: number,
    t: number,
  ): void {
    const w = 510, h = 270;
    const cur = this.model.cursors[slot]!;
    panel(ctx, x, y, w, h, cur.locked || this.isActive(slot) ? slotColor(slot) : undefined);

    const def = FIGHTERS[charId]!;
    const color = fighterColor(chars, slot);
    drawFigure(ctx, charId, color, x + 105, y + h - 26, 2, slot === 0 ? 1 : -1, idlePose(this.frame), t);

    const tx = x + 210;
    text(ctx, this.playerLabel(slot), tx, y + 32, { size: 15, bold: true, color: slotColor(slot) });
    text(ctx, def.name, tx, y + 66, { size: 32, bold: true, color: tint(color, 0.35), outline: true });
    text(ctx, lookOf(charId).title, tx, y + 90, { size: 15, bold: true, color: '#ffd166' });
    text(ctx, lookOf(charId).blurb, tx, y + 108, { size: 13, color: '#e6d6b0' });

    STAT_BARS[charId]!.forEach((bar, i) => {
      const by = y + 124 + i * 25;
      text(ctx, bar.label, tx, by + 12, { size: 14, color: '#d9c49a' });
      roundRect(ctx, tx + 64, by, 200, 14, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      roundRect(ctx, tx + 64, by, Math.max(14, 200 * bar.value), 14, 6);
      ctx.fillStyle = color;
      ctx.fill();
    });
    text(ctx, `Air jumps: ${def.stats.airJumps}`, tx, y + 236, { size: 13, color: '#d9c49a' });

    const status = cur.locked ? 'READY' : '';
    if (status) text(ctx, status, x + w - 20, y + 34, { size: 20, bold: true, align: 'right', color: slotColor(slot), outline: true });
    text(ctx, this.deviceLine(slot), x + w - 16, y + h - 14, { size: 12, align: 'right', color: 'rgba(255,255,255,0.55)' });
  }

  private deviceLine(slot: number): string {
    if (this.link && slot !== this.link.slot) return 'The other player · online';
    if (this.mode === 'training' && slot === 1) return 'Stands still · chosen by P1';
    if (isCpuSlot(this.mode, slot)) return `${CPU_LEVELS[this.app.cpu.level]!.name} CPU · chosen by P1`;
    const device = this.link ? 0 : slot; // online, this machine's player uses player 1's controls
    const pads = this.app.controls.padsOf(device).map((n) => `Pad ${n}`);
    const keys = keysSummary(this.app.controls.keyboard.keysOf(device));
    return [...(keys ? [`Keys: ${keys}`] : []), ...pads].join(' · ') || 'Connect a gamepad';
  }
}

/** Player 1 on the first fighter, each CPU on a different random one. */
function cpuStart(opponents: number): number[] {
  const others = FIGHTERS.map((_, i) => i).slice(1);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  return [0, ...others.slice(0, opponents)];
}
