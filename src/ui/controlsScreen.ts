// Controls: every action's keyboard key and gamepad button, and rebinding
// them. Pick a cell and press the new key (or pad button); if another action
// had it, the two swap. Changes are saved in this browser.

import { BINDINGS } from '../input/bindings';
import { connectedPads } from '../input/gamepad';
import { keyLabel, keysLabel } from '../input/keyLabels';
import {
  bindButton,
  bindKey,
  currentRemap,
  DEFAULT_REMAP,
  RESERVED_BUTTONS,
  RESERVED_KEYS,
  saveRemap,
  type KeyAction,
  type PadAction,
} from '../input/remap';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, panel, roundRect, text, type View } from './draw';

const W = 1100;
const H = 720;

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
const padLabel = (buttons: readonly number[]) => buttons.map((b) => PAD_NAMES[b] ?? `#${b}`).join(' / ');

interface Row {
  label: string;
  key: KeyAction;
  /** Directions have no pad button to rebind (stick and d-pad). */
  pad?: PadAction;
  what: string;
}

const ROWS: readonly Row[] = [
  { label: 'Up', key: 'up', what: 'Aim up · up special · climb a ledge' },
  { label: 'Left', key: 'left', what: 'Walk / run (hold)' },
  { label: 'Down', key: 'down', what: 'Crouch · drop through / fall past platforms · fast-fall' },
  { label: 'Right', key: 'right', what: 'Walk / run (hold)' },
  { label: 'Jump', key: 'jump', pad: 'jump', what: 'Tap: short hop · hold: full hop · again in the air' },
  { label: 'Attack', key: 'attack', pad: 'attack', what: 'Jab, tilts, dash attack · aerials in the air' },
  { label: 'Smash', key: 'heavy', pad: 'heavy', what: 'Smash attacks (hold to charge) · ground only' },
  { label: 'Special', key: 'special', pad: 'special', what: 'Neutral / side / up (recovery) / down special' },
  { label: 'Shield', key: 'dodge', pad: 'dodge', what: 'Hold: shield · +side: roll · +down: dodge · +attack: grab' },
  { label: 'Dash', key: 'dash', pad: 'dash', what: 'Quick burst along the ground' },
];
const RESET_ROW = ROWS.length;
const BACK_ROW = ROWS.length + 1;

type Waiting = { kind: 'key'; row: number } | { kind: 'pad'; row: number; held: Set<string> } | null;

export class ControlsScreen implements Screen {
  private row = 0;
  /** 0: keyboard column, 1: gamepad column. */
  private col = 0;
  private waiting: Waiting = null;
  private note = '';
  private noteTicks = 0;

  constructor(private app: App) {}

  leave(): void {
    this.app.controls.keyboard.captureNext(null);
  }

  private flash(note: string): void {
    this.note = note;
    this.noteTicks = 150;
  }

  tick(): void {
    if (this.noteTicks > 0) this.noteTicks--;
    if (this.waiting?.kind === 'pad') return this.waitForButton(this.waiting);
    if (this.waiting) return; // the keyboard calls back
    const c = this.app.controls;
    const kb = c.keyboard;
    const m = c.menu(0);
    const up = m.up || kb.wasPressed('ArrowUp');
    const down = m.down || kb.wasPressed('ArrowDown');
    const side = m.left || m.right || kb.wasPressed('ArrowLeft') || kb.wasPressed('ArrowRight');
    if (c.backKey || m.back) {
      this.app.sfx.back();
      return this.app.toMainMenu('Controls');
    }
    if (up || down) {
      this.row = (this.row + (down ? 1 : -1) + BACK_ROW + 1) % (BACK_ROW + 1);
      this.app.sfx.move();
    }
    if (side && this.row < ROWS.length) {
      this.col = 1 - this.col;
      this.app.sfx.move();
    }
    if (!(m.confirm || c.confirmKey || c.startButton)) return;
    this.app.sfx.select();
    if (this.row === BACK_ROW) return this.app.toMainMenu('Controls');
    if (this.row === RESET_ROW) {
      saveRemap(JSON.parse(JSON.stringify(DEFAULT_REMAP)));
      return this.flash('Back to the default controls');
    }
    const row = ROWS[this.row]!;
    if (this.col === 0) this.waitForKey(this.row);
    else if (row.pad) this.waiting = { kind: 'pad', row: this.row, held: this.heldButtons() };
    else this.flash('Directions on a pad are the left stick and the d-pad');
  }

  private waitForKey(rowIndex: number): void {
    this.waiting = { kind: 'key', row: rowIndex };
    this.app.controls.keyboard.captureNext((code) => {
      this.waiting = null;
      if (code === BINDINGS.menu.back) return this.flash('Unchanged');
      if (RESERVED_KEYS.includes(code)) return this.flash(`${keyLabel(code)} is kept for menus`);
      const row = ROWS[rowIndex]!;
      saveRemap(bindKey(currentRemap(), row.key, code));
      this.app.sfx.go();
      this.flash(`${row.label}: ${keyLabel(code)}`);
    });
  }

  /** Pad buttons held right now, as "pad:button". */
  private heldButtons(): Set<string> {
    const held = new Set<string>();
    for (const pad of connectedPads()) pad.buttons.forEach((b, i) => b.pressed && held.add(`${pad.index}:${i}`));
    return held;
  }

  private waitForButton(w: { row: number; held: Set<string> }): void {
    if (this.app.controls.keyboard.wasPressed(BINDINGS.menu.back)) {
      this.waiting = null;
      return this.flash('Unchanged');
    }
    const now = this.heldButtons();
    for (const id of now) {
      if (w.held.has(id)) continue;
      const button = Number(id.split(':')[1]);
      if (RESERVED_BUTTONS.includes(button)) {
        this.flash(`${PAD_NAMES[button]} is kept for pausing and switching players`);
        continue;
      }
      const row = ROWS[w.row]!;
      saveRemap(bindButton(currentRemap(), row.pad!, button));
      this.waiting = null;
      this.app.sfx.go();
      return this.flash(`${row.label}: ${PAD_NAMES[button] ?? `#${button}`}`);
    }
    // Buttons let go can be pressed again.
    for (const id of [...w.held]) if (!now.has(id)) w.held.delete(id);
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    text(ctx, 'Controls', W / 2, 58, { size: 40, bold: true, align: 'center', color: '#ffd166', outline: true });

    const cols = { label: 50, key: 190, pad: 370, what: 540 };
    const top = 84, rowH = 41;
    panel(ctx, 20, top, W - 40, 30 + ROWS.length * rowH + 8);
    text(ctx, 'Keyboard', cols.key, top + 24, { size: 16, bold: true, color: '#ffd166' });
    text(ctx, 'Gamepad', cols.pad, top + 24, { size: 16, bold: true, color: '#ffd166' });
    text(ctx, 'What it does', cols.what, top + 24, { size: 16, bold: true, color: '#ffd166' });
    const keys = BINDINGS.layouts.solo[0]!;
    const buttons = BINDINGS.gamepad.buttons;
    const waitingRow = this.waiting?.row ?? -1;

    ROWS.forEach((row, r) => {
      const y = top + 34 + r * rowH;
      const cellY = y + 4, cellH = rowH - 8;
      if (r === this.row) {
        const x = this.col === 0 ? cols.key - 12 : cols.pad - 12;
        roundRect(ctx, x, cellY, 160, cellH, 6);
        ctx.fillStyle = r === waitingRow ? 'rgba(255,209,102,0.55)' : 'rgba(255,209,102,0.22)';
        ctx.fill();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const mid = cellY + cellH / 2 + 6;
      text(ctx, row.label, cols.label, mid, { size: 17, bold: true });
      const keyText = r === waitingRow && this.waiting?.kind === 'key' ? 'press a key…' : keysLabel(keys[row.key]);
      const padText = r === waitingRow && this.waiting?.kind === 'pad' ? 'press a button…' : row.pad ? padLabel(buttons[row.pad]) : 'Stick / D-pad';
      text(ctx, keyText, cols.key, mid, { size: 16, color: '#ffffff' });
      text(ctx, padText, cols.pad, mid, { size: 16, color: row.pad ? '#ffffff' : 'rgba(255,255,255,0.5)' });
      text(ctx, row.what, cols.what, mid, { size: 14, color: '#d9c49a' });
    });

    const by = top + 30 + ROWS.length * rowH + 22;
    [['Reset to defaults', RESET_ROW], ['Back', BACK_ROW]].forEach(([label, r], i) => {
      const x = W / 2 - 230 + i * 250, on = this.row === r;
      roundRect(ctx, x, by, 210, 38, 8);
      ctx.fillStyle = on ? '#e9b44c' : 'rgba(40,26,14,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#b8862b';
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, String(label), x + 105, by + 25, { size: 17, bold: true, align: 'center', color: on ? '#2a1a0c' : '#f1e4c8' });
    });

    const hint = this.waiting
      ? this.waiting.kind === 'key'
        ? 'Press the new key (Esc: keep the old one)'
        : 'Press the new button on your gamepad (Esc: keep the old one)'
      : 'Up / down: choose · left / right: keyboard or gamepad · Attack / Enter: change · Esc: back';
    text(ctx, hint, W / 2, by + 70, { size: 15, align: 'center', color: '#ffffff', outline: true });
    if (this.noteTicks > 0) text(ctx, this.note, W / 2, by + 96, { size: 16, bold: true, align: 'center', color: '#9be59b', outline: true });
    text(ctx, 'Saved in this browser · Enter, Esc and F1 keep their jobs', W / 2, 706, {
      size: 13,
      align: 'center',
      color: 'rgba(255,255,255,0.55)',
    });
  }
}
