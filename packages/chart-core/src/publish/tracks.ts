// Which chart track each background sound goes on.
//
// Everything that is not a lane in the chart's mode plays automatically; any
// non-lane track will do for EZ2PORT. The original game, though, keeps ONE
// voice per track (EZ2PORT docs/judge-timing.md: "one voice entry per chart
// track"), so a sound placed on a track that is still ringing cuts it off. So
// this allocator is voice-aware: a sound goes on the first track in the pool
// that is silent by the time it starts, in the order the shipped charts use
// (1-2, then 22-63, then any other free non-lane track; never 0 = tempo or
// 21 = lights). When every track is busy it takes the one that frees up
// first, and counts the cut so lint can say so.

export interface BackingSlot {
  tick: number;
  startMs: number;
  /** How long the sound rings, ms (Infinity when unknown). */
  durMs: number;
}

export class BackingAllocator {
  private readonly pool: number[];
  private readonly endMs = new Map<number, number>();
  private readonly ticksUsed = new Map<number, Set<number>>();
  /** Sounds placed on a track that was still ringing. */
  chokes = 0;

  constructor(laneTracks: ReadonlySet<number>, trackCount = 64) {
    const order = [1, 2, ...Array.from({ length: trackCount - 22 }, (_, i) => 22 + i)];
    for (let t = 3; t < 21; t++) order.push(t);
    this.pool = order.filter((t) => t > 0 && t < trackCount && t !== 21 && !laneTracks.has(t));
  }

  /** Reserve a track for a record at `tick`; lanes' own records call `occupy`. */
  place(s: BackingSlot): number {
    let pick = -1;
    let earliest = -1;
    for (const t of this.pool) {
      if (this.ticksUsed.get(t)?.has(s.tick)) continue;
      const free = this.endMs.get(t) ?? -Infinity;
      if (free <= s.startMs) {
        pick = t;
        break;
      }
      if (earliest < 0 || free < (this.endMs.get(earliest) ?? Infinity)) earliest = t;
    }
    if (pick < 0) {
      if (earliest < 0)
        throw new Error(`every backing track already has a record at tick ${s.tick}`);
      pick = earliest;
      this.chokes++;
    }
    this.occupy(pick, s.tick, s.startMs + s.durMs);
    return pick;
  }

  occupy(track: number, tick: number, untilMs: number): void {
    let set = this.ticksUsed.get(track);
    if (!set) this.ticksUsed.set(track, (set = new Set()));
    set.add(tick);
    this.endMs.set(track, Math.max(this.endMs.get(track) ?? -Infinity, untilMs));
  }
}
