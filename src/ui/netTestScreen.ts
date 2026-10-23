// Netcode test: one match played by two rollback sessions side by side in
// this tab, each one player's "machine", linked by a fake network whose
// latency, jitter and packet loss are set with the sliders on top. P1's keys
// (and pad 1) drive the left machine, P2's keys (and pad 2) the right one.
// The two halves should always agree; checksums check it every second.

import { Sfx } from '../audio/sfx';
import { keysSummary } from '../input/keyLabels';
import { DEFAULT_INPUT_DELAY, Session } from '../net/session';
import { FakeNetwork } from '../net/transports/fakeNetwork';
import { netDebugLines } from '../render/debug';
import { DEFAULT_STOCKS } from '../sim/rules';
import { createMatch, type MatchSetup, type MatchState } from '../sim/state';
import type { App, Screen } from './app';
import { beginLayout, text, type View } from './draw';
import { countDown, COUNTDOWN, drawBanner, END_TICKS, HeldGate } from './matchFlow';
import { MatchView } from './matchView';
import { NetTestPanel, type NetTestSettings } from './netTestPanel';
import { matchResult, tallyDamage } from './results';

/** Kept across rematches. The defaults are M5's target conditions. */
const settings: NetTestSettings = { latencyMs: 100, jitterMs: 10, lossPercent: 5, inputDelay: DEFAULT_INPUT_DELAY };
/** "Hitch P2" freezes the right machine this many ticks. */
const HITCH_TICKS = 30;
/** Only the left machine makes sound (both would play every hit twice). Never unlocked, so silent. */
const silent = new Sfx();
const clock = () => performance.now();
const MONO = '13px ui-monospace, Consolas, monospace';

interface Half {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: MatchView;
}

export class NetTestScreen implements Screen {
  private panel: NetTestPanel;
  private halves: Half[];
  private gate: HeldGate;
  private setup!: MatchSetup;
  /** Shown on both halves during the countdown, before the machines start. */
  private preview!: MatchState;
  private net: FakeNetwork | null = null;
  private sessions: Session[] = [];
  private countdown = 0;
  private sinceStart = 0;
  private endTicks = -1;
  private hitch = 0;
  private damageDealt = [0, 0];

  constructor(
    private app: App,
    readonly chars: readonly number[],
  ) {
    this.gate = new HeldGate(app.controls);
    this.halves = [0, 1].map(() => {
      const canvas = document.createElement('canvas');
      return { canvas, ctx: canvas.getContext('2d')!, view: new MatchView(app) };
    });
    this.panel = new NetTestPanel(settings, [
      {
        label: 'Hitch P2',
        title: "Freeze P2's machine for half a second: P1's has to wait, then time sync evens them out",
        run: () => (this.hitch = HITCH_TICKS),
      },
      {
        label: 'Force desync',
        title: "Nudge P2's simulation (P1 gains 1%) and watch the next checksum catch it",
        run: () => this.sessions[1]?.corruptState(),
      },
      { label: 'Restart', title: 'New match, same fighters and settings', run: () => this.restart() },
    ]);
    this.restart();
  }

  leave(): void {
    this.panel.remove();
  }

  private restart(): void {
    this.keepReplay();
    this.setup = { seed: (Math.random() * 0x100000000) >>> 0, stageId: 0, chars: this.chars, stocks: DEFAULT_STOCKS };
    this.preview = createMatch(this.setup);
    this.net = null;
    this.sessions = [];
    this.halves.forEach((h, slot) => (h.view = new MatchView(this.app, slot === 0 ? this.app.sfx : silent)));
    this.countdown = COUNTDOWN;
    this.sinceStart = 0;
    this.endTicks = -1;
    this.hitch = 0;
    this.damageDealt = [0, 0];
    this.gate.block();
  }

  /** Countdown over: both machines start from frame 0 together. */
  private start(): void {
    const net = new FakeNetwork(settings, clock, this.setup.seed);
    this.net = net;
    this.sessions = [0, 1].map(
      (slot) =>
        new Session({
          setup: this.setup,
          localPlayer: slot,
          transport: net.ends[slot],
          now: clock,
          inputDelay: settings.inputDelay,
          onStep: (prev, next, resim) => this.halves[slot]!.view.onStep(prev, next, resim),
          onConfirm: slot === 0 ? (prev, next) => tallyDamage(this.damageDealt, prev, next) : undefined,
        }),
    );
  }

  /** Make this match the one "Watch replay" shows (the left machine's recording; both are the same). */
  private keepReplay(): void {
    const replay = this.sessions[0]?.replay;
    if (replay && replay.inputs.length > 0) this.app.lastMatch = { mode: 'netTest', replay };
  }

  tick(): void {
    const c = this.app.controls;
    if (c.backKey) {
      this.app.sfx.back();
      this.keepReplay();
      this.app.toMainMenu('Netcode test');
      return;
    }
    if (this.endTicks >= 0) {
      if (++this.endTicks >= END_TICKS) this.finish();
      return;
    }
    if (this.countdown > 0) {
      this.countdown = countDown(this.countdown, this.app.sfx);
      if (this.countdown === 0) this.start();
      this.gate.block();
      return;
    }

    this.net!.pump();
    const inputs = [this.gate.input(0), this.gate.input(1)];
    this.sessions.forEach((s, slot) => {
      s.inputDelay = settings.inputDelay;
      if (slot === 1 && this.hitch > 0) this.hitch--;
      else s.tick(inputs[slot]!);
    });
    this.sinceStart++;
    if (this.sessions.every((s) => s.finished)) this.endTicks = 0;
  }

  private finish(): void {
    this.keepReplay();
    this.app.toResults(matchResult('netTest', this.chars, this.sessions[0]!.confirmed, this.damageDealt));
  }

  draw(ctx: CanvasRenderingContext2D, view: View, dtMs: number): void {
    const top = Math.round(this.panel.height * view.dpr);
    const w = Math.max(1, Math.floor(view.w / 2));
    const h = Math.max(1, view.h - top);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#140d10';
    ctx.fillRect(0, 0, view.w, view.h);

    this.halves.forEach((half, slot) => {
      if (half.canvas.width !== w || half.canvas.height !== h) {
        half.canvas.width = w;
        half.canvas.height = h;
      }
      const hv: View = { w, h, dpr: view.dpr };
      const s = this.sessions[slot];
      const keys = keysSummary(this.app.controls.keyboard.keysOf(slot));
      half.view.draw(half.ctx, hv, dtMs, s?.state ?? this.preview, { labels: [], hint: `P${slot + 1}'s machine · ${keys}` }, s ? netDebugLines(s) : []);
      this.drawHalfOverlay(half.ctx, hv, slot, s);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(half.canvas, slot * w, top);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(w - 1, top, 2, h);

    drawBanner(ctx, view, { countdown: this.countdown, sinceStart: this.sinceStart, ended: this.endTicks >= 0 });
  }

  /** Which machine this is and its net stats (top right; in the F1 panel instead while that's open), plus alerts. */
  private drawHalfOverlay(ctx: CanvasRenderingContext2D, view: View, slot: number, s: Session | undefined): void {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const lines = [`P${slot + 1}'s machine`, ...(s && !this.app.debug ? netDebugLines(s) : [])];
    ctx.font = MONO;
    ctx.textAlign = 'left';
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const x = view.w / view.dpr - boxW - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, 8, boxW, lines.length * 17 + 10);
    lines.forEach((l, i) => {
      ctx.font = i === 0 ? `bold ${MONO}` : MONO;
      ctx.fillStyle = i === 0 ? '#ffd166' : l.startsWith('DESYNC') ? '#ff6b6b' : '#d6ffd6';
      ctx.fillText(l, x + 8, 26 + i * 17);
    });
    if (!s) return;

    const W = 560;
    beginLayout(ctx, view, W, 720);
    const alert = { size: 34, bold: true, align: 'center' as const, outline: true, color: '#ff4f4f' };
    if (s.desyncFrame >= 0) text(ctx, `DESYNC at frame ${s.desyncFrame}`, W / 2, 190, alert);
    else if (s.disconnected) text(ctx, 'CONNECTION LOST', W / 2, 190, alert);
    else if (s.waiting) text(ctx, `waiting for P${s.remotePlayer + 1}…`, W / 2, 190, { ...alert, size: 18, color: '#ffd166' });
  }
}
