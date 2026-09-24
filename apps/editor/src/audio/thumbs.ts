// Waveform thumbnails for the workbench, fetched only for cards on screen.
//
// Scrolling a grid of 1500 sounds asks for dozens of thumbnails a frame, so
// requests wait 30 ms and go to the engine as one batch per width (one IPC
// round trip, peaks built on the host's threads). Results are kept per
// Loaded - the object the engine returned for a file - so a sound that is
// loaded again gets a fresh thumbnail and a dropped one frees its cache.

import type { AudioBackend, Loaded } from '../bridge';

const BATCH_MS = 30;

interface Pending {
  loaded: Loaded;
  width: number;
  done: ((v: Int16Array) => void)[];
}

export class ThumbCache {
  private readonly cache = new WeakMap<Loaded, Map<number, Int16Array>>();
  private readonly inflight = new WeakMap<Loaded, Map<number, Promise<Int16Array>>>();
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Batches sent (the perf spec counts them). */
  batches = 0;

  constructor(private readonly audio: Pick<AudioBackend, 'thumbs'>) {}

  /** A thumbnail already fetched: `width` [min, max] pairs. */
  get(loaded: Loaded, width: number): Int16Array | undefined {
    return this.cache.get(loaded)?.get(width);
  }

  /** Fetch a thumbnail (with the next batch). Rejects for a sound that did not load. */
  request(loaded: Loaded, width: number): Promise<Int16Array> {
    const have = this.get(loaded, width);
    if (have) return Promise.resolve(have);
    if (loaded.id === null) return Promise.reject(new Error(loaded.error ?? 'not loaded'));
    let per = this.inflight.get(loaded);
    const running = per?.get(width);
    if (running) return running;
    const p = new Promise<Int16Array>((resolve) => {
      this.queue.push({ loaded, width, done: [resolve] });
    });
    if (!per) this.inflight.set(loaded, (per = new Map()));
    per.set(width, p);
    this.timer ??= setTimeout(() => void this.flush(), BATCH_MS);
    return p;
  }

  private async flush(): Promise<void> {
    this.timer = undefined;
    const queue = this.queue;
    this.queue = [];
    const byWidth = new Map<number, Pending[]>();
    for (const q of queue) {
      const list = byWidth.get(q.width);
      if (list) list.push(q);
      else byWidth.set(q.width, [q]);
    }
    await Promise.all(
      [...byWidth].map(async ([width, list]) => {
        this.batches++;
        let data: Int16Array;
        try {
          data = await this.audio.thumbs(
            list.map((q) => q.loaded.id!),
            width,
          );
        } catch {
          data = new Int16Array(list.length * width * 2);
        }
        list.forEach((q, i) => {
          const one = data.slice(i * width * 2, (i + 1) * width * 2);
          let per = this.cache.get(q.loaded);
          if (!per) this.cache.set(q.loaded, (per = new Map()));
          per.set(width, one);
          this.inflight.get(q.loaded)?.delete(width);
          for (const d of q.done) d(one);
        });
      }),
    );
  }
}

/** Draw a thumbnail: one vertical min-max line per column, mirrored about the middle. */
export function drawThumb(
  ctx: CanvasRenderingContext2D,
  data: Int16Array,
  w: number,
  h: number,
  color: string,
): void {
  ctx.clearRect(0, 0, w, h);
  const cols = data.length >> 1;
  if (!cols) return;
  const mid = h / 2;
  const scale = (h / 2 - 1) / 32767;
  ctx.fillStyle = color;
  const step = w / cols;
  for (let i = 0; i < cols; i++) {
    const lo = data[2 * i]!;
    const hi = data[2 * i + 1]!;
    const top = mid - Math.max(hi, 0) * scale;
    const bottom = mid - Math.min(lo, 0) * scale;
    ctx.fillRect(i * step, top, Math.max(1, step), Math.max(1, bottom - top));
  }
}
