// The browser Backend: an in-memory file system seeded with a demo song, a
// silent audio clock that runs on performance.now(), and no EZ2PORT. It keeps
// the editor fully usable in `pnpm dev` and makes the Playwright tests
// deterministic.

import {
  DISC_RADIUS,
  DISC_SIZE,
  EYECATCH_H,
  EYECATCH_W,
  PLATE_H,
  PLATE_W,
  centreSquare,
  eyecatchExtent,
  type ArtJob,
  type PlateSpec,
} from '@ez2bms/chart-core';
import { demoFiles, demoSeconds, demoStem, demoStemLevel, DEMO_DIR } from './demo';
import type {
  ArtPixels,
  PlatePixels,
  AudioEvent,
  Backend,
  ClockSnapshot,
  Entry,
  FileDrop,
  Imported,
  Inspection,
  Loaded,
  ProjectScan,
  RunEvent,
  TestSpec,
} from './types';

const AUDIO = /\.(wav|ogg|flac|mp3|ssf|ezw|oga)$/i;
const IMAGE = /\.(png|jpe?g|bmp)$/i;
const MOVIE = /\.(mp4|m4v|mov|webm|mkv|wmv|asf|avi|mpe?g)$/i;
const SETTINGS_KEY = 'ez2bms.settings';

/** A WAV's length from its header, or undefined for anything else. */
export function wavSeconds(b: Uint8Array): number | undefined {
  if (b.length < 12) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
  let bytesPerSecond = 0;
  for (let o = 12; o + 8 <= b.length;) {
    const size = dv.getUint32(o + 4, true);
    if (tag(o) === 'fmt ' && o + 20 <= b.length) bytesPerSecond = dv.getUint32(o + 16, true);
    if (tag(o) === 'data')
      return bytesPerSecond ? Math.min(size, b.length - o - 8) / bytesPerSecond : undefined;
    o += 8 + size + (size & 1);
  }
  return undefined;
}

/** A 16-bit PCM WAV's samples, for the browser build's waveforms of test files. */
export function wavPcm(
  b: Uint8Array,
): { rate: number; channels: number; pcm: Int16Array } | undefined {
  if (b.length < 12) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
  let fmt: { rate: number; channels: number; bits: number } | undefined;
  for (let o = 12; o + 8 <= b.length;) {
    const size = dv.getUint32(o + 4, true);
    if (tag(o) === 'fmt ' && o + 24 <= b.length)
      fmt = {
        channels: dv.getUint16(o + 10, true),
        rate: dv.getUint32(o + 12, true),
        bits: dv.getUint16(o + 22, true),
      };
    if (tag(o) === 'data') {
      if (!fmt || fmt.bits !== 16) return undefined;
      const n = Math.min(size, b.length - o - 8) >> 1;
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(o + 8 + 2 * i, true);
      return { rate: fmt.rate, channels: fmt.channels, pcm };
    }
    o += 8 + size + (size & 1);
  }
  return undefined;
}

/**
 * The browser's stand-in for ez2bms-media: the canvas scales (smoothly, not
 * with the importer's box average) and the disc is keyed as the port keys it.
 * Enough to see and test the cropper; the desktop app cuts the real bytes.
 */
export async function canvasArt(bytes: Uint8Array, job: ArtJob): Promise<ArtPixels> {
  const img = await createImageBitmap(new Blob([bytes as BlobPart]));
  const disc = job.kind === 'disc';
  const [w, h] = disc
    ? [DISC_SIZE, DISC_SIZE]
    : job.kind === 'plate'
      ? [PLATE_W, PLATE_H]
      : [EYECATCH_W, EYECATCH_H];
  const from = disc
    ? (job.crop ?? centreSquare(img.width, img.height))
    : job.kind === 'eyecatch' && job.mode === 'visible'
      ? eyecatchExtent(job.crop)
      : { x: 0, y: 0, w: img.width, h: img.height };
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  // A source rectangle past the image is clipped, its destination with it: black there.
  g.drawImage(img, from.x, from.y, from.w, from.h, 0, 0, w, h);
  img.close();
  const d = g.getImageData(0, 0, w, h).data;
  const rgb = new Uint8Array(w * h * 3);
  const c = DISC_SIZE / 2 - 0.5;
  for (let i = 0; i < w * h; i++) {
    const px = d.subarray(i * 4, i * 4 + 3);
    if (disc) {
      const [dx, dy] = [(i % w) - c, Math.floor(i / w) - c];
      if (dx * dx + dy * dy > DISC_RADIUS * DISC_RADIUS) continue;
      if (!px[0] && !px[1] && !px[2]) {
        rgb.fill(1, i * 3, i * 3 + 3);
        continue;
      }
    }
    rgb.set(px, i * 3);
  }
  return { w, h, rgb };
}

/**
 * The browser's stand-in for the plate renderer: the canvas's own bold sans
 * where the desktop app sets Roboto through stb_truetype. The layout follows
 * the spec (anchor, baseline, capital height, condensing); the pixels are
 * only a likeness.
 */
export function canvasPlate(spec: PlateSpec): PlatePixels {
  const canvas = new OffscreenCanvas(spec.w, spec.h);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, spec.w, spec.h);
  for (const l of spec.lines) {
    // A bold sans's capitals are about 0.72 of its size.
    g.font = `bold ${l.cap / 0.72}px Roboto, "Noto Sans CJK KR", sans-serif`;
    const natural = g.measureText(l.text).width;
    const sx = l.maxWidth > 0 && natural > l.maxWidth ? l.maxWidth / natural : 1;
    const w = natural * sx;
    const x0 = l.align === 'right' ? l.x - w : l.align === 'center' ? l.x - w / 2 : l.x;
    g.save();
    g.translate(x0, l.baseline);
    g.scale(sx, 1);
    if (l.glow) {
      g.shadowColor = `#${l.glow}`;
      g.shadowBlur = 4;
    }
    g.fillStyle = `#${l.ink}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(l.text, 0, 0);
    g.restore();
  }
  const d = g.getImageData(0, 0, spec.w, spec.h).data;
  const rgb = new Uint8Array(spec.w * spec.h * 3);
  for (let i = 0; i < spec.w * spec.h; i++) rgb.set(d.subarray(i * 4, i * 4 + 3), i * 3);
  // What the fonts would lack, as a test double: the private use area, which
  // Roboto and Noto Sans CJK leave empty too.
  const missing = [
    ...new Set(
      spec.lines.flatMap((l) => [...l.text].filter((c) => /[\u{e000}-\u{f8ff}]/u.test(c))),
    ),
  ];
  return { w: spec.w, h: spec.h, rgb, missing };
}

/** `defaults` are settings used where the stored ones say nothing (the demo's game folder). */
export function webBackend(
  seed: Map<string, Uint8Array> = demoFiles(),
  defaults: Record<string, unknown> = {},
): Backend {
  const files = new Map(seed);
  const mtimes = new Map<string, number>();
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const missing = (p: string) => new Error(`${p}: no such file`);
  let staged = 0;
  /** Browser files into the memory file system, each batch in its own folder. */
  const stage = async (list: File[]): Promise<string[]> => {
    const dir = `/_staged/${++staged}`;
    const out: string[] = [];
    for (const f of list) {
      const p = `${dir}/${f.name}`;
      files.set(p, new Uint8Array(await f.arrayBuffer()));
      mtimes.set(p, Date.now());
      out.push(p);
    }
    return out;
  };

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
  let cacheCap = 2048 * 2 ** 20;

  /** `dir/name` in any case, as EZ2PORT resolves it; the name found. */
  const childCi = (dir: string, name: string): string | null => {
    const d = dir + '/';
    for (const p of files.keys()) {
      if (!p.startsWith(d)) continue;
      const first = p.slice(d.length).split('/')[0]!;
      if (first.toLowerCase() === name.toLowerCase()) return first;
    }
    return null;
  };
  /** Move every file under `from` to `to` (or delete them when `to` is null). */
  const moveTree = (from: string, to: string | null) => {
    if (to) for (const k of [...files.keys()]) if (k.startsWith(to + '/')) files.delete(k);
    for (const k of [...files.keys()]) {
      if (!k.startsWith(from + '/')) continue;
      if (to) files.set(to + k.slice(from.length), files.get(k)!);
      files.delete(k);
    }
  };

  const backend: Backend = {
    kind: 'web',
    appInfo: async () => ({ version: '0.1.0', os: 'web', config_dir: null, cache_dir: null }),
    readFile: async (path) => {
      const b = files.get(norm(path));
      if (!b) throw missing(path);
      return b;
    },
    readRange: async (path, offset, length) => {
      const b = files.get(norm(path));
      if (!b) throw missing(path);
      return { size: b.length, bytes: b.slice(offset, offset + length) };
    },
    mediaUrl: async (path) => {
      const b = files.get(norm(path));
      if (!b) throw missing(path);
      return URL.createObjectURL(new Blob([b as BlobPart]));
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
        images: all
          .filter((p) => IMAGE.test(p) && !p.split('/').some((s) => s.startsWith('.')))
          .sort(),
        movies: all
          .filter((p) => MOVIE.test(p) && !p.split('/').some((s) => s.startsWith('.')))
          .sort(),
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
    // A real file chooser; what is picked is staged in the memory file system
    // (browsers give bytes, not paths) and its staged paths returned.
    pickFiles: (_title, extensions) =>
      new Promise<string[]>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = extensions
          .filter((e) => e !== '*')
          .map((e) => `.${e}`)
          .join(',');
        input.onchange = () => void stage([...(input.files ?? [])]).then(resolve);
        input.oncancel = () => resolve([]);
        input.click();
      }),
    importFiles: async (dir, paths, kind = 'audio') => {
      const d = norm(dir);
      const takes = kind === 'image' ? IMAGE : kind === 'movie' ? MOVIE : AUDIO;
      const out: Imported[] = [];
      const wanted: string[] = [];
      for (const p of paths.map(norm)) {
        if (files.has(p)) wanted.push(p);
        else wanted.push(...[...files.keys()].filter((k) => k.startsWith(p + '/')).sort());
      }
      for (const from of wanted) {
        const base = from.slice(from.lastIndexOf('/') + 1);
        if (!takes.test(base) || base.startsWith('.')) {
          if (
            !from
              .slice(0, from.lastIndexOf('/'))
              .split('/')
              .some((s) => s.startsWith('.'))
          )
            out.push({
              from,
              name: null,
              reused: false,
              error:
                kind === 'image'
                  ? 'not an image EZ2BMS can read (PNG, JPEG or BMP)'
                  : kind === 'movie'
                    ? 'not a movie (MP4, MOV, WebM, MKV, WMV, AVI or MPEG)'
                    : 'not an audio file EZ2BMS can play',
            });
          continue;
        }
        if (from.startsWith(d + '/')) {
          out.push({ from, name: from.slice(d.length + 1), reused: true, error: null });
          continue;
        }
        const bytes = files.get(from)!;
        const dot = base.lastIndexOf('.');
        const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
        for (let n = 1; ; n++) {
          const name = n === 1 ? base : `${stem} (${n})${ext}`;
          const target = `${d}/${name}`;
          const have = [...files.keys()].find((k) => k.toLowerCase() === target.toLowerCase());
          if (have) {
            const old = files.get(have)!;
            if (old.length === bytes.length && old.every((v, i) => v === bytes[i])) {
              out.push({ from, name: have.slice(d.length + 1), reused: true, error: null });
              break;
            }
            continue;
          }
          files.set(target, bytes.slice());
          mtimes.set(target, Date.now());
          out.push({ from, name, reused: false, error: null });
          break;
        }
      }
      return out;
    },
    renameFile: async (from, to) => {
      const [f, t] = [norm(from), norm(to)];
      const b = files.get(f);
      if (!b) throw missing(from);
      const clash = [...files.keys()].find((k) => k.toLowerCase() === t.toLowerCase());
      if (clash && clash.toLowerCase() !== f.toLowerCase()) throw new Error(`${to} already exists`);
      files.delete(f);
      files.set(t, b);
      mtimes.set(t, Date.now());
    },
    onFileDrop: (cb: (d: FileDrop) => void) => {
      const over = (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        cb({ kind: 'over', paths: [], x: e.clientX, y: e.clientY });
      };
      const leave = (e: DragEvent) => {
        // Only when the drag leaves the window, not each element.
        if (e.relatedTarget === null) cb({ kind: 'leave', paths: [], x: e.clientX, y: e.clientY });
      };
      const drop = (e: DragEvent) => {
        const list = [...(e.dataTransfer?.files ?? [])];
        if (!list.length) return;
        e.preventDefault();
        const at = { x: e.clientX, y: e.clientY };
        void stage(list).then((paths) => cb({ kind: 'drop', paths, ...at }));
      };
      window.addEventListener('dragover', over);
      window.addEventListener('dragleave', leave);
      window.addEventListener('drop', drop);
      return () => {
        window.removeEventListener('dragover', over);
        window.removeEventListener('dragleave', leave);
        window.removeEventListener('drop', drop);
      };
    },
    audio: {
      info: async () => ({ rate: RATE, backend: 'web', device_error: null }),
      load: async (paths): Promise<Loaded[]> =>
        paths.map((path) => {
          let id = ids.get(path);
          if (id === undefined) ids.set(path, (id = ids.size));
          const bytes = files.get(norm(path));
          const seconds = (bytes && wavSeconds(bytes)) ?? demoSeconds(path);
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
      // Made-up shapes, different per sample and stable, so thumbnails draw.
      thumbs: async (ids, width) => {
        const out = new Int16Array(ids.length * width * 2);
        ids.forEach((id, k) => {
          for (let i = 0; i < width; i++) {
            const t = i / Math.max(1, width - 1);
            const env =
              30000 *
              Math.exp(-t * (2 + (id % 5))) *
              (0.55 + 0.45 * Math.abs(Math.sin((i + id * 7) * 0.7)));
            out[(k * width + i) * 2] = -env;
            out[(k * width + i) * 2 + 1] = env;
          }
        });
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
      // No mixer here: a likeness from how many sounds start near each column.
      previewOverview: async (evs, endMs, width) => {
        const end = Math.max(1, endMs);
        const out = new Int16Array(width * 2);
        for (const e of evs) {
          if (e.ms >= end) continue;
          const c = Math.min(width - 1, Math.floor((e.ms / end) * width));
          out[c * 2 + 1] = Math.min(30000, out[c * 2 + 1]! + 2500);
        }
        for (let c = 0; c < width; c++) {
          const v = Math.max(out[c * 2 + 1]!, c > 0 ? out[c * 2 - 1]! * 0.8 : 0);
          out[c * 2 + 1] = v;
          out[c * 2] = -v;
        }
        return out;
      },
      preview: async (job) => ({
        sample: 1 << 20,
        seconds: job.length_ms / 1000,
        voice: (1 << 16) + 255,
      }),
      // Mipmap buckets as ez2bms-audio lays them out (64 frames at level 0,
      // doubling): the demo stem's pattern, a test's WAV from its samples,
      // anything else a made-up decay.
      peakRange: async (id, level, from, count) => {
        const path = [...ids].find(([, v]) => v === id)?.[0] ?? '';
        const bytes = files.get(norm(path));
        const wav = bytes && wavPcm(bytes);
        const seconds = (bytes && wavSeconds(bytes)) ?? demoSeconds(path);
        const frames = Math.round(seconds * RATE);
        const base = 64;
        const len0 = Math.max(1, Math.ceil(frames / base));
        const levels = len0 > 1 ? Math.ceil(Math.log2(len0)) + 1 : 1;
        const k = Math.min(level, levels - 1);
        const bucket = base * 2 ** k;
        const length = Math.ceil(frames / bucket);
        const a = Math.min(from, length);
        const b = Math.min(a + count, length);
        const data = new Int16Array((b - a) * 2);
        // The demo's own stems are empty files; a real WAV is drawn from its samples.
        const stem = wav ? undefined : demoStem(path);
        for (let i = a; i < b; i++) {
          const t0 = (i * bucket) / RATE;
          const t1 = Math.min(((i + 1) * bucket) / RATE, seconds);
          let lo = 0;
          let hi = 0;
          if (stem) {
            hi = Math.round(demoStemLevel(stem, t0, t1) * 32767);
            lo = -hi;
          } else if (wav) {
            const s0 = Math.floor(t0 * wav.rate) * wav.channels;
            const s1 = Math.max(s0 + 1, Math.ceil(t1 * wav.rate) * wav.channels);
            for (let j = s0; j < Math.min(s1, wav.pcm.length); j++) {
              lo = Math.min(lo, wav.pcm[j]!);
              hi = Math.max(hi, wav.pcm[j]!);
            }
          } else {
            hi = Math.round(30000 * Math.exp((-4 * t0) / Math.max(seconds, 1e-3)));
            lo = -hi;
          }
          data[(i - a) * 2] = lo;
          data[(i - a) * 2 + 1] = hi;
        }
        return { base, levels, frames, length, from: a, data };
      },
      // The demo stem's hits and tempo, as the Rust analysis would find them.
      analysis: async (id) => {
        const path = [...ids].find(([, v]) => v === id)?.[0] ?? '';
        const bytes = files.get(norm(path));
        const stem = bytes && wavPcm(bytes) ? undefined : demoStem(path);
        if (!stem) return { onsets: [], tempo: [] };
        return {
          onsets: stem.hits.map((h): [number, number] => [h.sec, Math.min(1, h.amp / 0.8)]),
          tempo: [{ bpm: stem.bpm, first_beat: 0, confidence: 0.9 }],
        };
      },
      // The browser decodes nothing, so there is nothing to keep on disk.
      cacheInfo: async () => ({ dir: null, entries: 0, bytes: 0, cap: cacheCap }),
      cacheSetCap: async (mb) => {
        cacheCap = mb * 2 ** 20;
      },
      cacheClear: async () => {},
    },
    media: {
      art: async (path, job) => {
        const b = files.get(norm(path));
        if (!b) throw missing(path);
        return canvasArt(b, job);
      },
      plate: async (spec) => canvasPlate(spec),
    },
    port: {
      locate: async () => ({ game_root: null, ez2play: null, songs_root: null }),
      probe: async () => {
        throw new Error('EZ2PORT is only available in the desktop app');
      },
      // The same rules as ez2bms-launch's package writer, on the memory files.
      inspect: async (songsRoot, key, gameRoot): Promise<Inspection> => {
        const folder = childCi(norm(songsRoot), key);
        const dir = folder && `${norm(songsRoot)}/${folder}`;
        const names = dir
          ? [...files.keys()]
              .filter((k) => k.startsWith(dir + '/'))
              .map((k) => k.slice(dir.length + 1))
              .filter((n) => !n.includes('/'))
              .sort()
          : [];
        const ini = dir && names.find((n) => n.toLowerCase() === 'song.ini');
        const sound = gameRoot && childCi(norm(gameRoot), 'sound');
        return {
          folder,
          song_ini: ini ? new TextDecoder().decode(files.get(`${dir}/${ini}`)) : null,
          files: names,
          shipped: !!sound && !!childCi(`${norm(gameRoot!)}/${sound}`, key),
        };
      },
      publish: async (songsRoot, pkg, options = {}) => {
        const root = norm(songsRoot);
        const now = await backend.port.inspect(songsRoot, pkg.key, null);
        if (options.expect && options.expect.song_ini !== now.song_ini)
          throw new Error(
            `${root}/${pkg.key} changed since it was checked; look again before publishing`,
          );
        const old = now.folder ? `${root}/${now.folder}` : null;
        const kept = new Map<string, Uint8Array>();
        for (const name of options.carry ?? []) {
          const have = now.files.find((n) => n.toLowerCase() === name.toLowerCase());
          if (old && have) kept.set(name, files.get(`${old}/${have}`)!);
        }
        // A copy's source is checked before anything moves, as the host does.
        const copies = (pkg.copies ?? []).map((c) => {
          const from = c.from.startsWith('/') ? norm(c.from) : `${norm(pkg.project_dir)}/${c.from}`;
          const b = files.get(from);
          if (!b) throw missing(from);
          return [c.name, b] as const;
        });
        if (old) moveTree(old, options.backup ? `${root}/.ez2bms-backup/${pkg.key}` : null);
        for (const f of pkg.files) files.set(`${root}/${pkg.key}/${f.path}`, f.bytes.slice());
        for (const [n, b] of kept) files.set(`${root}/${pkg.key}/${n}`, b);
        for (const [n, b] of copies) files.set(`${root}/${pkg.key}/${n}`, b);
        return {
          dir: `${root}/${pkg.key}`,
          files: pkg.files.length + kept.size + copies.length,
          missing: [],
        };
      },
      retire: async (songsRoot, key, songIni) => {
        const now = await backend.port.inspect(songsRoot, key, null);
        if (!now.folder || now.song_ini !== songIni)
          throw new Error(
            `${norm(songsRoot)}/${key} changed since it was checked; leaving it alone`,
          );
        moveTree(`${norm(songsRoot)}/${now.folder}`, `${norm(songsRoot)}/.ez2bms-backup/${key}`);
      },
      test: async (_spec: TestSpec, _on: (e: RunEvent) => void) => {
        throw new Error('Test in EZ2PORT needs the desktop app');
      },
      stop: async () => {},
    },
  };
  return backend;
}
