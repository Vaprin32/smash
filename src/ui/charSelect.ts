import { idlePose } from '../render/animations';
import { fighterColor, lookOf, slotColor } from '../render/renderer';
import { tint } from '../render/skeleton';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { MoveId } from '../sim/moves/types';
import type { App, Mode, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, panel, roundRect, text, type View } from './draw';
import { CharSelectModel, GRID_COLS } from './menuModel';

const W = 1100;
const H = 760;
const CELL_W = 150;
const CELL_H = 160;
const GAP = 14;
const GRID_TOP = 84;

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

  constructor(
    private app: App,
    readonly mode: Mode,
    chars?: readonly number[],
  ) {
    this.model = new CharSelectModel(mode, FIGHTERS.length, chars ?? [0, 1]);
  }

  tick(): void {
    this.frame++;
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
        this.app.toMainMenu();
        break;
      case 'start':
        sfx.go();
        this.app.startMatch(this.mode, this.model.cursors.map((cur) => cur.index));
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    beginLayout(ctx, view, W, H);
    const training = this.mode === 'training';
    const chars = this.model.cursors.map((c) => c.index);

    text(ctx, training ? 'Training' : 'Local Versus', W / 2, 46, { size: 34, bold: true, align: 'center', color: '#ffd166', outline: true });
    text(ctx, training ? "Pick your fighter, then the CPU's" : 'Both players pick a fighter', W / 2, 72, {
      size: 15,
      align: 'center',
      color: '#c9c7e8',
    });

    // Grid. Every fighter is drawn at the same scale, so sizes compare.
    FIGHTERS.forEach((def, i) => {
      const { x, y } = cellRect(i);
      panel(ctx, x, y, CELL_W, CELL_H);
      drawFigure(ctx, i, lookOf(i).body, x + CELL_W / 2, y + CELL_H - 34, 1.1, 1, idlePose(this.frame + i * 13), t);
      text(ctx, def.name, x + CELL_W / 2, y + CELL_H - 12, { size: 16, bold: true, align: 'center' });
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
      const bx = slot === 0 ? x - 4 : x + CELL_W - bw + 4;
      roundRect(ctx, bx, y - 10, bw, 22, 8);
      ctx.fillStyle = slotColor(slot);
      ctx.fill();
      text(ctx, label, bx + bw / 2, y + 6, { size: 14, bold: true, align: 'center' });
    });

    // One preview panel per player.
    const top = GRID_TOP + 2 * CELL_H + GAP + 18;
    this.model.cursors.forEach((cur, slot) => this.drawPreview(ctx, slot, cur.index, chars, 30 + slot * 530, top, t));

    const footY = 742;
    if (this.model.ready) {
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
    return this.mode === 'training' && slot === 1 ? 'CPU' : `P${slot + 1}`;
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
    const active = this.model.activeCursor(0) === slot || this.model.activeCursor(slot) === slot;
    panel(ctx, x, y, w, h, cur.locked || active ? slotColor(slot) : undefined);

    const def = FIGHTERS[charId]!;
    const color = fighterColor(chars, slot);
    drawFigure(ctx, charId, color, x + 105, y + h - 26, 2, slot === 0 ? 1 : -1, idlePose(this.frame), t);

    const tx = x + 210;
    text(ctx, this.playerLabel(slot), tx, y + 32, { size: 15, bold: true, color: slotColor(slot) });
    text(ctx, def.name, tx, y + 66, { size: 32, bold: true, color: tint(color, 0.35), outline: true });
    text(ctx, lookOf(charId).blurb, tx, y + 92, { size: 13, color: '#d6d4ee' });

    STAT_BARS[charId]!.forEach((bar, i) => {
      const by = y + 118 + i * 26;
      text(ctx, bar.label, tx, by + 12, { size: 14, color: '#c9c7e8' });
      roundRect(ctx, tx + 64, by, 200, 14, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      roundRect(ctx, tx + 64, by, Math.max(14, 200 * bar.value), 14, 6);
      ctx.fillStyle = color;
      ctx.fill();
    });
    text(ctx, `Air jumps: ${def.stats.airJumps}`, tx, y + 236, { size: 13, color: '#c9c7e8' });

    const status = cur.locked ? 'READY' : '';
    if (status) text(ctx, status, x + w - 20, y + 34, { size: 20, bold: true, align: 'right', color: slotColor(slot), outline: true });
    text(ctx, this.deviceLine(slot), x + w - 16, y + h - 14, { size: 12, align: 'right', color: 'rgba(255,255,255,0.55)' });
  }

  private deviceLine(slot: number): string {
    if (this.mode === 'training' && slot === 1) return 'Stands still · chosen by P1';
    const pads = this.app.controls.padsOf(slot).map((n) => `Pad ${n}`);
    const keys = slot === 0 ? 'Keys: WASD + J K I ; L N' : 'Keys: arrows + numpad';
    return [keys, ...pads].join(' · ');
  }
}
