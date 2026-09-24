// Where the notes are, fast.
//
// The chart keeps notes as a flat list; the editor asks lane- and
// range-shaped questions sixty times a second ("what is visible in lane 13
// between these pulses?", "what does channel 7 play?"). This index answers
// them by binary search over per-lane and per-channel arrays sorted by
// (y, id), and tracks the longest hold per lane so a range query also finds
// holds that started above the range and are still running.
//
// Updates are incremental: a small batch splices into the sorted arrays
// (microseconds even at 50k notes); a large one rebuilds the arrays it touched.

import type { ChannelId, NoteId, NoteRec } from '../model/types';

const byYId = (a: NoteRec, b: NoteRec) => a.y - b.y || a.id - b.id;

/** First index with (y, id) >= (y, id) of the probe. */
function lowerYId(arr: readonly NoteRec[], y: number, id: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const n = arr[mid]!;
    if (n.y < y || (n.y === y && n.id < id)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerY(arr: readonly NoteRec[], y: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.y < y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const BULK = 256;

export class NoteIndex {
  private readonly byId = new Map<NoteId, NoteRec>();
  private readonly lanes = new Map<number, NoteRec[]>();
  private readonly channels = new Map<ChannelId, NoteRec[]>();
  /** Upper bound of hold length per lane (never shrinks until a rebuild). */
  private readonly maxLen = new Map<number, number>();

  constructor(notes: readonly NoteRec[] = []) {
    this.rebuild(notes);
  }

  rebuild(notes: readonly NoteRec[]): void {
    this.byId.clear();
    this.lanes.clear();
    this.channels.clear();
    this.maxLen.clear();
    for (const n of notes) {
      this.byId.set(n.id, n);
      push(this.lanes, n.x, n);
      push(this.channels, n.ch, n);
      this.bumpLen(n);
    }
    for (const a of this.lanes.values()) a.sort(byYId);
    for (const a of this.channels.values()) a.sort(byYId);
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: NoteId): NoteRec | undefined {
    return this.byId.get(id);
  }

  has(id: NoteId): boolean {
    return this.byId.has(id);
  }

  all(): IterableIterator<NoteRec> {
    return this.byId.values();
  }

  /** Every lane that has notes. */
  laneKeys(): number[] {
    return [...this.lanes.keys()].filter((x) => this.lanes.get(x)!.length > 0);
  }

  /** Notes of a lane, sorted by (y, id). Do not mutate. */
  lane(x: number): readonly NoteRec[] {
    return this.lanes.get(x) ?? [];
  }

  /** Notes of a channel, sorted by (y, id). Do not mutate. */
  channel(ch: ChannelId): readonly NoteRec[] {
    return this.channels.get(ch) ?? [];
  }

  /** Notes on lane x that touch [y0, y1]: starting inside it, or holds running through it. */
  inRange(x: number, y0: number, y1: number): NoteRec[] {
    const arr = this.lanes.get(x);
    if (!arr) return [];
    const from = lowerY(arr, y0 - (this.maxLen.get(x) ?? 0));
    const out: NoteRec[] = [];
    for (let i = from; i < arr.length; i++) {
      const n = arr[i]!;
      if (n.y > y1) break;
      if (n.y + n.l >= y0) out.push(n);
    }
    return out;
  }

  /** Notes on lane x exactly at y. */
  at(x: number, y: number): NoteRec[] {
    const arr = this.lanes.get(x);
    if (!arr) return [];
    const out: NoteRec[] = [];
    for (let i = lowerY(arr, y); i < arr.length && arr[i]!.y === y; i++) out.push(arr[i]!);
    return out;
  }

  /** The hold on lane x whose body strictly contains y (y inside (start, start+l]), if any. */
  holdCovering(x: number, y: number): NoteRec | undefined {
    const arr = this.lanes.get(x);
    if (!arr) return undefined;
    const end = lowerY(arr, y);
    const from = lowerY(arr, y - (this.maxLen.get(x) ?? 0));
    for (let i = end - 1; i >= from; i--) {
      const n = arr[i]!;
      if (n.l > 0 && n.y < y && n.y + n.l >= y) return n;
    }
    return undefined;
  }

  insert(notes: readonly NoteRec[]): void {
    const bulk = notes.length > BULK;
    const touchedLanes = new Set<number>();
    const touchedCh = new Set<ChannelId>();
    for (const n of notes) {
      if (this.byId.has(n.id)) throw new Error(`note ${n.id} is already in the chart`);
      this.byId.set(n.id, n);
      this.bumpLen(n);
      if (bulk) {
        push(this.lanes, n.x, n);
        push(this.channels, n.ch, n);
        touchedLanes.add(n.x);
        touchedCh.add(n.ch);
      } else {
        sortedInsert(this.lanes, n.x, n);
        sortedInsert(this.channels, n.ch, n);
      }
    }
    if (bulk) {
      for (const x of touchedLanes) this.lanes.get(x)!.sort(byYId);
      for (const c of touchedCh) this.channels.get(c)!.sort(byYId);
    }
  }

  remove(notes: readonly NoteRec[]): void {
    const bulk = notes.length > BULK;
    const gone = new Set<NoteId>();
    for (const n of notes) {
      const cur = this.byId.get(n.id);
      if (!cur) throw new Error(`note ${n.id} is not in the chart`);
      this.byId.delete(n.id);
      if (bulk) gone.add(n.id);
      else {
        sortedRemove(this.lanes, cur.x, cur);
        sortedRemove(this.channels, cur.ch, cur);
      }
    }
    if (bulk) {
      for (const [k, a] of this.lanes)
        this.lanes.set(
          k,
          a.filter((n) => !gone.has(n.id)),
        );
      for (const [k, a] of this.channels)
        this.channels.set(
          k,
          a.filter((n) => !gone.has(n.id)),
        );
    }
  }

  /**
   * Re-file a note whose position, lane or channel is about to change. Call
   * with the note's CURRENT fields, then mutate, then call `refileEnd`.
   */
  refileBegin(n: NoteRec): void {
    sortedRemove(this.lanes, n.x, n);
    sortedRemove(this.channels, n.ch, n);
  }

  refileEnd(n: NoteRec): void {
    sortedInsert(this.lanes, n.x, n);
    sortedInsert(this.channels, n.ch, n);
    this.bumpLen(n);
  }

  private bumpLen(n: NoteRec): void {
    if (n.l > (this.maxLen.get(n.x) ?? 0)) this.maxLen.set(n.x, n.l);
  }

  /** Debug/test: verify the arrays against a fresh build. */
  check(notes: readonly NoteRec[]): string | undefined {
    const fresh = new NoteIndex(notes);
    if (fresh.size !== this.size) return `size ${this.size} vs ${fresh.size}`;
    for (const x of new Set([...this.lanes.keys(), ...fresh.lanes.keys()])) {
      const a = this.lane(x)
        .map((n) => n.id)
        .join();
      const b = fresh
        .lane(x)
        .map((n) => n.id)
        .join();
      if (a !== b) return `lane ${x}: ${a} vs ${b}`;
    }
    for (const c of new Set([...this.channels.keys(), ...fresh.channels.keys()])) {
      const a = this.channel(c)
        .map((n) => n.id)
        .join();
      const b = fresh
        .channel(c)
        .map((n) => n.id)
        .join();
      if (a !== b) return `channel ${c}: ${a} vs ${b}`;
    }
    return undefined;
  }
}

function push<K>(m: Map<K, NoteRec[]>, k: K, n: NoteRec): void {
  const a = m.get(k);
  if (a) a.push(n);
  else m.set(k, [n]);
}

function sortedInsert<K>(m: Map<K, NoteRec[]>, k: K, n: NoteRec): void {
  let a = m.get(k);
  if (!a) m.set(k, (a = []));
  a.splice(lowerYId(a, n.y, n.id), 0, n);
}

function sortedRemove<K>(m: Map<K, NoteRec[]>, k: K, n: NoteRec): void {
  const a = m.get(k);
  if (!a) throw new Error(`index has no bucket ${String(k)} for note ${n.id}`);
  let i = lowerYId(a, n.y, n.id);
  if (a[i] !== n) {
    // Identity lookup as a fallback (the caller may have passed a copy).
    i = a.findIndex((m2) => m2.id === n.id);
    if (i < 0) throw new Error(`note ${n.id} missing from bucket ${String(k)}`);
  }
  a.splice(i, 1);
}
