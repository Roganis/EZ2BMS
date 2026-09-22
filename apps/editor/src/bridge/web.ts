// The browser Backend: an in-memory file system seeded with a demo song, a
// silent audio clock that runs on performance.now(), and no EZ2PORT. It keeps
// the editor fully usable in `pnpm dev` and makes the Playwright tests
// deterministic.

import { demoFiles, demoSeconds, DEMO_DIR } from './demo';
import type {
  AudioEvent,
  Backend,
  ClockSnapshot,
  Entry,
  Loaded,
  ProjectScan,
  RunEvent,
  TestSpec,
} from './types';

const AUDIO = /\.(wav|ogg|flac|mp3|ssf|ezw|oga)$/i;
const IMAGE = /\.(png|jpe?g|bmp)$/i;
const SETTINGS_KEY = 'ez2bms.settings';

/** `defaults` are settings used where the stored ones say nothing (the demo's game folder). */
export function webBackend(
  seed: Map<string, Uint8Array> = demoFiles(),
  defaults: Record<string, unknown> = {},
): Backend {
  const files = new Map(seed);
  const mtimes = new Map<string, number>();
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const missing = (p: string) => new Error(`${p}: no such file`);

  const list = async (dir: string): Promise<Entry[]> => {
    const d = norm(dir) + '/';
    const seen = new Map<string, Entry>();
    for (const [p, b] of files) {
      if (!p.startsWith(d)) continue;
      const rest = p.slice(d.length);
      const slash = rest.indexOf('/');
      const name = slash < 0 ? rest : rest.slice(0, slash);
      if (seen.has(name)) continue;
      seen.set(name, {
        name,
        is_dir: slash >= 0,
        size: slash < 0 ? b.length : 0,
        modified_ms: mtimes.get(p) ?? 0,
      });
    }
    return [...seen.values()].sort(
      (a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name),
    );
  };

  // ---- the silent clock
  const RATE = 48000;
  let playing = false;
  let startPerf = 0;
  let startFrame = 0;
  let generation = 0;
  const ids = new Map<string, number>();
  const snapshot = (): ClockSnapshot => {
    const now = performance.now();
    return {
      frame: playing ? Math.floor(startFrame + ((now - startPerf) * RATE) / 1000) : startFrame,
      host_ns: now * 1e6,
      latency_frames: 0,
      rate: RATE,
      playing,
      generation,
      now_ns: now * 1e6,
    };
  };
  let events: AudioEvent[] = [];

  return {
    kind: 'web',
    appInfo: async () => ({ version: '0.1.0', os: 'web', config_dir: null, cache_dir: null }),
    readFile: async (path) => {
      const b = files.get(norm(path));
      if (!b) throw missing(path);
      return b;
    },
    readText: async (path) => {
      const b = files.get(norm(path));
      if (!b) throw missing(path);
      return new TextDecoder().decode(b);
    },
    writeText: async (path, text) => {
      files.set(norm(path), new TextEncoder().encode(text));
      mtimes.set(norm(path), Date.now());
    },
    writeBytes: async (path, bytes) => {
      files.set(norm(path), bytes.slice());
      mtimes.set(norm(path), Date.now());
    },
    list,
    scanProject: async (dir): Promise<ProjectScan> => {
      const d = norm(dir);
      const top = await list(d);
      const all = [...files.keys()]
        .filter((p) => p.startsWith(d + '/'))
        .map((p) => p.slice(d.length + 1));
      return {
        dir: d,
        charts: top.filter((e) => !e.is_dir && /\.bmson$/i.test(e.name)),
        sidecar: top.find((e) => e.name === 'ez2bms.song.json') ?? null,
        samples: all
          .filter((p) => AUDIO.test(p) && !p.split('/').some((s) => s.startsWith('.')))
          .sort(),
        images: all.filter((p) => IMAGE.test(p)).sort(),
      };
    },
    loadSettings: async () => {
      try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<
          string,
          unknown
        >;
        // A default stands in for a setting stored empty, too (settings are saved whole).
        for (const [k, v] of Object.entries(defaults)) stored[k] ??= v;
        return stored;
      } catch {
        return { ...defaults };
      }
    },
    saveSettings: async (v) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
      } catch {
        // Private mode or blocked storage: settings last for the session.
      }
    },
    pickFolder: async () => DEMO_DIR,
    pickFiles: async () => [],
    audio: {
      info: async () => ({ rate: RATE, backend: 'web', device_error: null }),
      load: async (paths): Promise<Loaded[]> =>
        paths.map((path) => {
          let id = ids.get(path);
          if (id === undefined) ids.set(path, (id = ids.size));
          const seconds = demoSeconds(path);
          return {
            path,
            id,
            frames: Math.round(seconds * RATE),
            channels: 2,
            seconds,
            error: null,
          };
        }),
      peaks: async (id) => {
        const n = 256;
        const out = new Int16Array(n * 2);
        for (let i = 0; i < n; i++) {
          const env = Math.exp(-i / 40) * 30000 * (0.6 + 0.4 * Math.sin((i + id) * 0.9));
          out[2 * i] = -env;
          out[2 * i + 1] = env;
        }
        return out;
      },
      setEvents: async (e) => {
        events = e;
        void events;
      },
      play: async (fromMs) => {
        startFrame = Math.round((fromMs * RATE) / 1000);
        startPerf = performance.now();
        playing = true;
        generation++;
      },
      seek: async (ms) => {
        startFrame = Math.round((ms * RATE) / 1000);
        playing = false;
        generation++;
      },
      stop: async () => {
        startFrame = snapshot().frame;
        playing = false;
        generation++;
      },
      trigger: async () => true,
      setMaster: async () => {},
      clock: async () => snapshot(),
      now: async () => performance.now() * 1e6,
      streamClock: (on) => {
        const t = setInterval(() => on(snapshot()), 8);
        return () => clearInterval(t);
      },
    },
    port: {
      locate: async () => ({ game_root: null, ez2play: null, songs_root: null }),
      probe: async () => {
        throw new Error('EZ2PORT is only available in the desktop app');
      },
      publish: async (songsRoot, pkg) => {
        for (const f of pkg.files)
          files.set(`${norm(songsRoot)}/${pkg.key}/${f.path}`, f.bytes.slice());
        return { dir: `${norm(songsRoot)}/${pkg.key}`, files: pkg.files.length, missing: [] };
      },
      test: async (_spec: TestSpec, _on: (e: RunEvent) => void) => {
        throw new Error('Test in EZ2PORT needs the desktop app');
      },
      stop: async () => {},
    },
  };
}
