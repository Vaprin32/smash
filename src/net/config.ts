// Where the signaling server is. In order:
//  1. `?signal=wss://host:port` in the page URL (remembered in this browser),
//  2. a remembered one from an earlier visit,
//  3. VITE_SIGNAL_URL at build time,
//  4. port 8787 on the page's own host (localhost when opened from disk).

const STORAGE_KEY = 'smash.signalUrl';
const DEFAULT_PORT = 8787;

export interface SignalConfig {
  url: string;
  /** Came from the page URL or storage: share links must carry it so the friend uses the same server. */
  custom: boolean;
}

export function signalConfig(loc: Location = location): SignalConfig {
  const fromPage = new URLSearchParams(loc.search).get('signal');
  if (fromPage && isWsUrl(fromPage)) {
    store(fromPage);
    return { url: fromPage, custom: true };
  }
  const stored = load();
  if (stored && isWsUrl(stored)) return { url: stored, custom: true };
  const built = import.meta.env.VITE_SIGNAL_URL as string | undefined;
  if (built && isWsUrl(built)) return { url: built, custom: false };
  const host = loc.protocol === 'file:' || !loc.hostname ? 'localhost' : loc.hostname;
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return { url: `${scheme}://${host}:${DEFAULT_PORT}`, custom: false };
}

/** A link that opens the game and joins `code` directly. */
export function joinLink(code: string, cfg: SignalConfig, loc: Location = location): string {
  const params = new URLSearchParams({ room: code });
  if (cfg.custom) params.set('signal', cfg.url);
  return `${loc.origin === 'null' ? 'file://' : loc.origin}${loc.pathname}?${params}`;
}

/** The room code in the page URL (a join link), removed from the address bar so a reload doesn't rejoin. */
export function takeRoomFromUrl(loc: Location = location, history: History = window.history): string | null {
  const params = new URLSearchParams(loc.search);
  const code = params.get('room');
  if (!code) return null;
  params.delete('room');
  const rest = params.toString();
  history.replaceState(null, '', `${loc.pathname}${rest ? `?${rest}` : ''}${loc.hash}`);
  return code;
}

function isWsUrl(s: string): boolean {
  return /^wss?:\/\/[^\s/]+/.test(s);
}

function store(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // Storage blocked (private window): the URL parameter still works for this visit.
  }
}

function load(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
