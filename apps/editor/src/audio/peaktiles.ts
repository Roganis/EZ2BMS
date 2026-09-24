// Waveforms for the stem strips: parts of a sample's peak mipmap, fetched as
// the strips scroll and zoom.
//
// A strip asks, per pixel row, for the loudest point of some stretch of the
// file. The engine keeps a min/max mipmap per sample (64 frames a bucket at
// level 0, doubling); we fetch it in tiles of 4096 buckets of the level that
// fits a row, and answer from whatever is here - a coarser level while finer
// tiles are on their way - so a strip never draws blank, only sharpens.
// The coarse level that holds the whole file in one tile is fetched first.
//
// Kept per Loaded (the engine's answer for a file): a sound loaded again
// gets fresh tiles, and a dropped one frees them. At most MAX_TILES tiles
// are kept, the least recently used going first.

import type { AudioBackend, Loaded } from '../bridge';

export const TILE = 4096;
const MAX_TILES = 2048;

interface Meta {
  base: number;
  levels: number;
  frames: number;
  /** Frames a second (the engine's rate). */
  rate: number;
}

interface Entry {
  meta?: Meta;
  /** `level:tile` -> [min, max] pairs. */
  tiles: Map<string, Int16Array>;
  pending: Set<string>;
  /** The finest level held whole (its one tile), once fetched. */
  whole?: number;
}

export class PeakTiles {
  private readonly entries = new WeakMap<Loaded, Entry>();
  /** Every tile held, oldest use first, for the size limit. */
  private readonly lru = new Map<string, { e: Entry; key: string }>();
  private seq = 0;
  private readonly ids = new WeakMap<Entry, number>();
  /** The tile touched last: a strip's rows hit one tile many times in a row. */
  private lastTouch: { e: Entry; key: string } | undefined;

  constructor(
    private readonly audio: Pick<AudioBackend, 'peakRange'>,
    /** Called when tiles arrive (draw again). */
    private readonly onLoad: () => void,
  ) {}

  private entry(l: Loaded): Entry {
    let e = this.entries.get(l);
    if (!e) {
      this.entries.set(l, (e = { tiles: new Map(), pending: new Set() }));
      this.ids.set(e, ++this.seq);
      void this.start(l, e);
    }
    return e;
  }

  /** The mipmap's shape, then the coarsest level that is one tile. */
  private async start(l: Loaded, e: Entry): Promise<void> {
    if (l.id === null || !(l.seconds > 0)) return;
    const head = await this.audio.peakRange(l.id, 0, 0, 0).catch(() => undefined);
    if (!head) return;
    e.meta = {
      base: head.base,
      levels: head.levels,
      frames: head.frames,
      rate: head.frames / l.seconds,
    };
    let k = 0;
    while (k + 1 < head.levels && Math.ceil(head.frames / (head.base * 2 ** k)) > TILE) k++;
    await this.fetch(l, e, k, 0);
    e.whole = k;
    this.onLoad();
  }

  private async fetch(l: Loaded, e: Entry, level: number, tile: number): Promise<void> {
    const key = `${level}:${tile}`;
    if (e.tiles.has(key) || e.pending.has(key) || l.id === null) return;
    e.pending.add(key);
    try {
      const r = await this.audio.peakRange(l.id, level, tile * TILE, TILE);
      e.tiles.set(key, r.data);
      this.touch(e, key);
      if (e.whole !== undefined) this.onLoad();
    } catch {
      // Left out: the coarser level keeps answering.
    } finally {
      e.pending.delete(key);
    }
  }

  private touch(e: Entry, key: string): void {
    if (this.lastTouch?.e === e && this.lastTouch.key === key) return;
    this.lastTouch = { e, key };
    const id = `${this.ids.get(e)}|${key}`;
    this.lru.delete(id);
    this.lru.set(id, { e, key });
    while (this.lru.size > MAX_TILES) {
      const [oldest, v] = this.lru.entries().next().value!;
      this.lru.delete(oldest);
      // The whole-file level stays: it is what everything falls back to.
      if (v.key !== `${v.e.whole}:0`) v.e.tiles.delete(v.key);
    }
  }

  /** Frames a second for this sample, once its mipmap's shape is known. */
  rate(l: Loaded): number | undefined {
    return this.entry(l).meta?.rate;
  }

  /**
   * [min, max] (i16) of the sample over seconds [a, b): from the level whose
   * buckets fit that stretch, fetching its missing tiles (`onLoad` fires as
   * they come) and meanwhile from the nearest coarser level here. Undefined
   * until the whole-file level is here.
   */
  range(l: Loaded, a: number, b: number): [number, number] | undefined {
    const e = this.entry(l);
    const m = e.meta;
    if (!m || e.whole === undefined) return undefined;
    const f0 = Math.max(0, Math.floor(a * m.rate));
    const f1 = Math.min(m.frames, Math.max(f0 + 1, Math.ceil(b * m.rate)));
    if (f0 >= m.frames) return [0, 0];
    // The coarsest level whose buckets are no wider than the stretch.
    let want = 0;
    while (want + 1 < m.levels && m.base * 2 ** (want + 1) <= f1 - f0) want++;
    // That level, fetching what is missing; meanwhile the nearest coarser one here.
    const first = Math.min(want, e.whole);
    for (let k = first; k <= e.whole; k++) {
      const got = this.over(l, e, m, k, f0, f1, k === first);
      if (got) return got;
    }
    return undefined;
  }

  /** Min/max over frames [f0, f1) at level k, if every tile needed is here (fetching them if asked). */
  private over(
    l: Loaded,
    e: Entry,
    m: Meta,
    k: number,
    f0: number,
    f1: number,
    fetch: boolean,
  ): [number, number] | undefined {
    const bucket = m.base * 2 ** k;
    const b0 = Math.floor(f0 / bucket);
    const b1 = Math.max(b0 + 1, Math.ceil(f1 / bucket));
    let lo = 32767;
    let hi = -32767;
    let missing = false;
    for (let t = Math.floor(b0 / TILE); t <= Math.floor((b1 - 1) / TILE); t++) {
      const key = `${k}:${t}`;
      const tile = e.tiles.get(key);
      if (!tile) {
        missing = true;
        if (fetch) void this.fetch(l, e, k, t);
        continue;
      }
      this.touch(e, key);
      const from = Math.max(b0 - t * TILE, 0);
      const to = Math.min(b1 - t * TILE, tile.length >> 1);
      for (let i = from; i < to; i++) {
        const a = tile[2 * i]!;
        const b = tile[2 * i + 1]!;
        if (a < lo) lo = a;
        if (b > hi) hi = b;
      }
    }
    if (missing) return undefined;
    return hi < lo ? [0, 0] : [lo, hi];
  }
}
