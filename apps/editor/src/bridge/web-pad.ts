// The browser build's controllers: boards that exist only in memory, plugged
// and pressed by tests (window.__ez2bmsPad) at exact host times - Playwright
// cannot set a KeyboardEvent's timeStamp, so exact-time input tests go
// through here. It behaves as the desktop host does (src-tauri input.rs over
// ez2bms-input): boards are named by make with `#n` in plug order, events
// flow only while the editor holds the pads, and every change of the open set
// is a `devices` event.

import type { ConfigFile, DevPad, InputBackend, PadEvent, PadInfo } from './types';

/** ezpad.c key_for/count_same over boards in order (ez2bms-input device.rs keys_for). */
export function padKeys(makes: readonly { vid: number; pid: number }[]): string[] {
  const keys: string[] = [];
  for (const { vid, pid } of makes) {
    const base = `${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}`;
    const seen = keys.filter((k) => k === base || k.startsWith(base + '#')).length;
    keys.push(seen ? `${base}#${seen}` : base);
  }
  return keys;
}

export interface WebPadEnv {
  /** The host time (ns) at which the playing song reaches `ms`. */
  hostAtSong(ms: number): number;
  isFile(path: string): boolean;
  /** Whether `dir` is a game data folder (`sound` and `system` in it). */
  isGameRoot(dir: string): boolean;
}

/** Where the browser build pretends the per-user settings folder is. */
export const WEB_USER_CONFIG = '/config/ez2port';

export function webPads(env: WebPadEnv): { input: InputBackend; devPad: DevPad } {
  type Board = Omit<PadInfo, 'key'>;
  const boards: Board[] = [];
  let active = false;
  let sink: ((evs: PadEvent[]) => void) | null = null;
  const hostNow = () => performance.now() * 1e6;

  const devices = (): PadInfo[] => {
    const keys = padKeys(boards);
    return boards.map((b, i) => ({ ...b, key: keys[i]! }));
  };
  const send = (evs: PadEvent[]) => {
    const to = sink;
    // Asynchronous, as a Tauri channel is.
    if (to) queueMicrotask(() => to(evs));
  };
  const rescan = () => send([{ kind: 'devices', devices: active ? devices() : [] }]);
  const known = (key: string) => {
    if (!devices().some((d) => d.key === key)) throw new Error(`no pad ${key}`);
  };
  const control = (ev: PadEvent) => {
    if ('device' in ev) known(ev.device);
    if (active) send([ev]);
  };

  const input: InputBackend = {
    info: async () => ({ devices: active ? devices() : [], active, error: null }),
    stream: (on) => {
      sink = on;
      return () => {
        if (sink === on) sink = null;
      };
    },
    hold: async (on) => {
      if (on === active) return;
      active = on;
      rescan();
    },
    configFiles: async (ez2play, gameRoot) => {
      const out: ConfigFile[] = [];
      const add = (dir: string, source: ConfigFile['source']) => {
        for (const kind of ['keys', 'settings'] as const) {
          const path = `${dir}/${kind}.ini`;
          if (!out.some((c) => c.path === path))
            out.push({ kind, path, exists: env.isFile(path), source });
        }
      };
      const exeDir = ez2play ? ez2play.replace(/[\\/][^\\/]*$/, '') : null;
      for (const d of [exeDir, gameRoot]) if (d && env.isGameRoot(d)) add(`${d}/ez2port`, 'data');
      add(WEB_USER_CONFIG, 'user');
      return out;
    },
  };

  const devPad: DevPad = {
    plug: (info = {}) => {
      boards.push({
        name: info.name ?? 'Virtual pad',
        vid: info.vid ?? 0x0810,
        pid: info.pid ?? 0xe501,
        buttons: info.buttons ?? 25,
        axes: info.axes ?? 2,
        hats: info.hats ?? 0,
      });
      if (active) rescan();
      return devices()[boards.length - 1]!.key;
    },
    unplug: (key) => {
      const i = devices().findIndex((d) => d.key === key);
      if (i < 0) throw new Error(`no pad ${key}`);
      boards.splice(i, 1);
      if (active) rescan();
    },
    button: (key, index, down, hostNs = hostNow()) =>
      control({ kind: 'button', device: key, index, down, hostNs }),
    hat: (key, index, value, hostNs = hostNow()) =>
      control({ kind: 'hat', device: key, index, value, hostNs }),
    axis: (key, index, value, hostNs = hostNow()) =>
      control({ kind: 'axis', device: key, index, value, hostNs }),
    hostNow,
    hostAtSong: (ms) => env.hostAtSong(ms),
    get active() {
      return active;
    },
  };
  return { input, devPad };
}
