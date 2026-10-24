// Create / join an online room: talk to the signaling server, show the room
// code and a join link (host) or ask for a code (guest), then connect the two
// browsers directly with WebRTC and check both run the same game. From there
// the room is an OnlineLink and play moves on to character select.
//
// The code box and the link are plain DOM over the canvas, so typing and
// copying work as usual; the keyboard's game keys ignore focused text fields.

import { joinLink, signalConfig, type SignalConfig } from '../net/config';
import { OnlineLink, rtcChannels } from '../net/online';
import { connectPeer, type PeerChannels } from '../net/peer';
import { normalizeRoomCode, ROOM_CODE_LENGTH, type IceServer, type ServerMessage } from '../net/signalMessages';
import { SignalingClient } from '../net/signalingClient';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, text, type View } from './draw';

const W = 1100;
const H = 720;
const DOM_FONT = '"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';

export type LobbyKind = 'create' | 'join';

type Phase =
  | { kind: 'server' }
  | { kind: 'enter-code' }
  | { kind: 'waiting'; code: string }
  | { kind: 'joining'; code: string }
  | { kind: 'linking'; code: string }
  | { kind: 'error'; message: string; detail: string };

export class OnlineLobbyScreen implements Screen {
  private phase: Phase = { kind: 'server' };
  private cfg: SignalConfig = signalConfig();
  private sig: SignalingClient | null = null;
  private alive = true;
  private box: HTMLDivElement;
  /** A guest's problem with the last code (shown under the box). */
  private codeNote = '';
  private copied = 0;
  private frame = 0;

  /** `code`: join this room straight away (from a join link). */
  constructor(
    private app: App,
    readonly kind: LobbyKind,
    code?: string,
  ) {
    this.box = document.createElement('div');
    this.box.style.cssText =
      'position:fixed;left:50%;top:56%;transform:translateX(-50%);z-index:1;display:none;align-items:center;gap:10px;' +
      `padding:12px 16px;background:linear-gradient(#4a2f1b,#2e1d10);border:2px solid #b8862b;border-radius:10px;color:#f1e4c8;font:16px ${DOM_FONT}`;
    document.body.append(this.box);
    void this.run(code);
  }

  leave(): void {
    this.alive = false;
    this.box.remove();
    this.sig?.close();
  }

  private async run(code?: string): Promise<void> {
    const sig = new SignalingClient(this.cfg.url);
    this.sig = sig;
    let iceServers: IceServer[];
    try {
      iceServers = await sig.ready;
    } catch {
      return this.fail(
        "Can't reach the signaling server",
        `Tried ${this.cfg.url}. Start one with "npm run server", or open the game with ?signal=wss://your-server.`,
      );
    }
    if (!this.alive) return;
    sig.onClose = () => this.fail('Lost the signaling server', `The connection to ${this.cfg.url} closed.`);

    const paired = new Promise<{ role: 'host' | 'guest'; code: string }>((resolve) => {
      let pending = '';
      sig.onMessage = (msg: ServerMessage) => {
        if (msg.t === 'room') {
          pending = msg.code;
          this.phase = { kind: 'waiting', code: msg.code };
          this.showLink(msg.code);
        } else if (msg.t === 'paired') {
          const roomCode = this.phase.kind === 'joining' || this.phase.kind === 'waiting' ? this.phase.code : pending;
          resolve({ role: msg.role, code: roomCode });
        } else if (msg.t === 'error') {
          if (msg.reason === 'no-room' || msg.reason === 'full') {
            const tried = this.phase.kind === 'joining' ? this.phase.code : '';
            this.codeNote = msg.reason === 'full' ? `Room ${tried} already has two players.` : `No open room with code ${tried}.`;
            this.askForCode();
          } else {
            this.fail('The server turned us away', msg.reason === 'busy' ? 'It has too many rooms open; try again soon.' : `(${msg.reason})`);
          }
        }
      };
    });

    if (this.kind === 'create') sig.send({ t: 'create' });
    else if (code && normalizeRoomCode(code)) this.join(normalizeRoomCode(code)!);
    else {
      if (code) this.codeNote = `"${code}" isn't a room code.`;
      this.askForCode();
    }

    const { role, code: roomCode } = await paired;
    if (!this.alive) return;
    this.hideBox();
    this.phase = { kind: 'linking', code: roomCode };
    sig.onClose = () => {}; // the peers no longer need it
    let channels: PeerChannels;
    try {
      channels = await connectPeer(sig, role, iceServers);
    } catch {
      return this.fail(
        "Couldn't connect to the other player",
        'A direct connection failed (strict NATs or firewalls). The server can relay through TURN: see the README.',
      );
    }
    sig.close();
    if (!this.alive) {
      channels.pc.close();
      return;
    }
    const link = new OnlineLink(rtcChannels(channels), role === 'host' ? 0 : 1, roomCode);
    try {
      await link.ready;
    } catch {
      return this.fail(
        link.lost === 'version' ? 'Your games are different versions' : 'The other player dropped',
        link.lost === 'version' ? 'Both reload the page (or rebuild) so you run the same game, then try again.' : 'Try again.',
      );
    }
    if (!this.alive) return link.leave();
    this.app.sfx.go();
    this.app.enterOnline(link);
  }

  private join(code: string): void {
    this.phase = { kind: 'joining', code };
    this.codeNote = '';
    this.hideBox();
    this.sig?.send({ t: 'join', code });
  }

  private fail(message: string, detail: string): void {
    if (!this.alive || this.phase.kind === 'error') return;
    this.phase = { kind: 'error', message, detail };
    this.hideBox();
    this.sig?.close();
    this.app.sfx.back();
  }

  private back(): void {
    this.app.sfx.back();
    this.app.toMainMenu(this.kind === 'create' ? 'Create Online Room' : 'Join Online Room');
  }

  tick(): void {
    this.frame++;
    if (this.copied > 0) this.copied--;
    const c = this.app.controls;
    if (c.backKey || c.menu(0).back) return this.back();
    if (this.phase.kind === 'error' && (c.confirmKey || c.startButton || c.menu(0).confirm)) return this.back();
  }

  // ---- DOM ----

  private hideBox(): void {
    this.box.replaceChildren();
    this.box.style.display = 'none';
  }

  private askForCode(): void {
    this.phase = { kind: 'enter-code' };
    this.box.replaceChildren();
    const input = document.createElement('input');
    input.maxLength = ROOM_CODE_LENGTH;
    input.placeholder = 'CODE';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText =
      `width:170px;padding:6px 10px;font:bold 30px ${DOM_FONT};letter-spacing:6px;text-transform:uppercase;text-align:center;` +
      'background:#1d120a;color:#ffd166;border:1px solid #b8862b;border-radius:6px;outline:none';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = normalizeRoomCode(input.value);
        if (code) this.join(code);
        else this.codeNote = `A room code is ${ROOM_CODE_LENGTH} letters.`;
      } else if (e.key === 'Escape') {
        this.back();
      }
    });
    const go = this.button('Join', () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    this.box.append(input, go);
    this.box.style.display = 'flex';
    input.focus();
  }

  private showLink(code: string): void {
    this.box.replaceChildren();
    const url = joinLink(code, this.cfg);
    const field = document.createElement('input');
    field.readOnly = true;
    field.value = url;
    field.style.cssText = `width:min(440px,60vw);padding:6px 8px;font:14px ${DOM_FONT};background:#1d120a;color:#f1e4c8;border:1px solid #b8862b;border-radius:6px`;
    field.addEventListener('focus', () => field.select());
    const copy = this.button('Copy link', () => {
      field.select();
      const done = () => (this.copied = 120);
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => document.execCommand('copy') && done());
      else if (document.execCommand('copy')) done();
      field.blur();
    });
    this.box.append(field, copy);
    this.box.style.display = 'flex';
  }

  private button(label: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.tabIndex = -1;
    b.style.cssText = `padding:7px 14px;font:bold 15px ${DOM_FONT};color:#2a1a0c;background:linear-gradient(#ffe39a,#d9a441);border:1px solid #fff3c4;border-radius:6px;cursor:pointer`;
    b.addEventListener('click', () => {
      run();
      b.blur();
    });
    return b;
  }

  // ---- Canvas ----

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    const title = this.kind === 'create' ? 'Create Online Room' : 'Join Online Room';
    text(ctx, title, W / 2, 110, { size: 44, bold: true, align: 'center', color: '#ffd166', outline: true });
    const dots = '.'.repeat(1 + (Math.floor(this.frame / 20) % 3));
    const center = { align: 'center' as const, outline: true };
    const p = this.phase;

    switch (p.kind) {
      case 'server':
        text(ctx, `Connecting to the server${dots}`, W / 2, 300, { ...center, size: 24 });
        break;
      case 'enter-code':
        text(ctx, "Type your friend's room code", W / 2, 300, { ...center, size: 26, bold: true });
        text(ctx, 'then press Enter', W / 2, 334, { ...center, size: 18, color: '#d9c49a' });
        if (this.codeNote) text(ctx, this.codeNote, W / 2, 520, { ...center, size: 18, color: '#ff8a7a' });
        break;
      case 'waiting':
        text(ctx, 'Room code', W / 2, 200, { ...center, size: 22, color: '#d9c49a' });
        text(ctx, p.code.split('').join(' '), W / 2, 300, { ...center, size: 92, bold: true, color: '#ffd166' });
        text(ctx, `Send your friend the code or the link below. Waiting for them to join${dots}`, W / 2, 360, { ...center, size: 18 });
        if (this.copied > 0) text(ctx, 'Link copied', W / 2, 520, { ...center, size: 18, color: '#9be59b' });
        break;
      case 'joining':
        text(ctx, `Joining room ${p.code}${dots}`, W / 2, 300, { ...center, size: 26 });
        break;
      case 'linking':
        text(ctx, `Room ${p.code}`, W / 2, 250, { ...center, size: 26, color: '#d9c49a' });
        text(ctx, `Connecting to the other player${dots}`, W / 2, 300, { ...center, size: 26, bold: true });
        break;
      case 'error':
        text(ctx, p.message, W / 2, 290, { ...center, size: 32, bold: true, color: '#ff6b5b' });
        text(ctx, p.detail, W / 2, 334, { ...center, size: 17 });
        text(ctx, 'Press Attack or Enter to go back', W / 2, 400, { ...center, size: 18, color: '#d9c49a' });
        break;
    }
    text(ctx, `Esc: back · server ${this.cfg.url}`, W / 2, 690, { size: 14, align: 'center', color: 'rgba(255,255,255,0.55)' });
  }
}
