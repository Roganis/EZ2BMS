// Which chart track each background sound goes on.
//
// Everything that is not a lane in the chart's mode plays automatically; any
// non-lane track will do for EZ2PORT. The original game, though, keeps ONE
// voice per track (EZ2PORT reference/play.c: the engine's sound entries are
// indexed by the chart track), so a sound placed on a track that is still
// ringing cuts it off. So this allocator is voice-aware: a sound goes on the
// first track in the pool that is silent by the time it starts, in the order
// the shipped charts use (1-2, then 22-63, then any other free non-lane
// track; never 0 = tempo or 21 = lights). When every track is busy it takes
// the one that frees up first, and counts the cut so lint can say so.
//
// For a cabinet export (publish/cabinet.ts) two more things hold:
// - A game chart's background notes keep the track they came on (`x_track`),
//   so the original's own voice cuts stay exactly as its author made them.
//   Those are pinned first, as intervals, and every other sound is placed
//   around them - into the gaps between the original's sounds, never over one.
// - A game chart has its own track count (often 23); rather than choke, the
//   allocator may add tracks up to a limit.
// Sounds are placed in time order, so for sounds placed here "busy" is only
// "still ringing from an earlier one" (endMs); pins can lie ahead in time and
// are checked as intervals. Without pins and growth this is exactly the
// allocator EZ2PORT packages have always been written with (the publish
// goldens hold it to that).

export interface BackingSlot {
  tick: number;
  startMs: number;
  /** How long the sound rings, ms (Infinity when unknown). */
  durMs: number;
}

export interface BackingOptions {
  /** Add tracks, up to this many, when every track is busy (the cabinet: a game chart's own count, then up to 64). */
  maxTracks?: number;
}

export class BackingAllocator {
  private readonly pool: number[];
  private readonly laneTracks: ReadonlySet<number>;
  private readonly maxTracks: number;
  private readonly endMs = new Map<number, number>();
  private readonly pins = new Map<number, { start: number; end: number }[]>();
  private readonly ticksUsed = new Map<number, Set<number>>();
  private count: number;
  /** Sounds placed on a track that was still ringing. */
  chokes = 0;
  /** Tracks added because every track was busy. */
  grown = 0;

  constructor(laneTracks: ReadonlySet<number>, trackCount = 64, opts: BackingOptions = {}) {
    this.laneTracks = laneTracks;
    this.count = trackCount;
    this.maxTracks = Math.max(trackCount, opts.maxTracks ?? trackCount);
    const order = [1, 2, ...Array.from({ length: trackCount - 22 }, (_, i) => 22 + i)];
    for (let t = 3; t < 21; t++) order.push(t);
    this.pool = order.filter((t) => this.usable(t) && t < trackCount);
  }

  /** How many tracks the chart needs: the count it started with, plus any added. */
  get trackCount(): number {
    return this.count;
  }

  private usable(t: number): boolean {
    return t > 0 && t !== 21 && !this.laneTracks.has(t);
  }

  /** Put these tracks last in the pool (a game chart's tracks with a volume change on them). */
  avoid(tracks: Iterable<number>): void {
    const last = new Set(tracks);
    const keep = this.pool.filter((t) => !last.has(t));
    const moved = this.pool.filter((t) => last.has(t));
    this.pool.splice(0, this.pool.length, ...keep, ...moved);
  }

  /**
   * A sound that goes on this track whatever else is there (the original's own
   * placement). Returns whether it starts while an earlier pinned sound on the
   * track still rings - a cut the original itself has.
   */
  pin(track: number, tick: number, startMs: number, endMs: number): boolean {
    let list = this.pins.get(track);
    if (!list) this.pins.set(track, (list = []));
    const cuts = list.some((p) => p.start <= startMs && p.end > startMs && p.start < endMs);
    list.push({ start: startMs, end: endMs });
    let set = this.ticksUsed.get(track);
    if (!set) this.ticksUsed.set(track, (set = new Set()));
    set.add(tick);
    if (track >= this.count) this.count = track + 1;
    return cuts;
  }

  /** When a track is free for a sound ringing [startMs, endMs): its last placed sound's end, or a pin's in the way. */
  private freeAt(t: number, startMs: number, endMs: number): number {
    let free = this.endMs.get(t) ?? -Infinity;
    const pins = this.pins.get(t);
    if (pins)
      for (const p of pins) if (p.start < endMs && p.end > startMs) free = Math.max(free, p.end);
    return free;
  }

  /** Reserve a track for a record at `tick`; lanes' own records call `occupy`. */
  place(s: BackingSlot): number {
    const end = s.startMs + s.durMs;
    let pick = -1;
    let earliest = -1;
    let earliestFree = Infinity;
    for (const t of this.pool) {
      if (this.ticksUsed.get(t)?.has(s.tick)) continue;
      const free = this.freeAt(t, s.startMs, end);
      if (free <= s.startMs) {
        pick = t;
        break;
      }
      if (earliest < 0 || free < earliestFree) {
        earliest = t;
        earliestFree = free;
      }
    }
    while (pick < 0 && this.count < this.maxTracks) {
      const t = this.count++;
      if (!this.usable(t)) continue;
      this.pool.push(t);
      this.grown++;
      pick = t;
    }
    if (pick < 0) {
      if (earliest < 0)
        throw new Error(`every backing track already has a record at tick ${s.tick}`);
      pick = earliest;
      this.chokes++;
    }
    this.occupy(pick, s.tick, end);
    return pick;
  }

  occupy(track: number, tick: number, untilMs: number): void {
    let set = this.ticksUsed.get(track);
    if (!set) this.ticksUsed.set(track, (set = new Set()));
    set.add(tick);
    this.endMs.set(track, Math.max(this.endMs.get(track) ?? -Infinity, untilMs));
  }
}
