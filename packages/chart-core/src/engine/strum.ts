// ScratchMix is a fret-and-strum game (EZ2PORT reference/play.c 2426-2501,
// from the original's GFMainGameDirector::m45d200; docs/GAMEPLAY-AUDIT.md
// 1273-1322): the turntable is the STRUM and the five keys are FRETS.
//
// - A fret pressed alone sounds nothing and judges nothing.
// - A strum (either turntable direction going down) plays and judges every
//   fret on its side that is held at that moment - the pedal excepted, which
//   is not a fret - and arms that side's latch for six frames.
// - A fret pressed while the latch is armed counts as if strummed, so
//   fretting a moment late is a hit rather than a miss.
// - Only down edges count.
//
// The port's latch runs on its frame clock; EZ2BMS's runs on the events' own
// times, which is what they are judged at anyway (ez2port-compat.md).

/** Six frames at 60 Hz (reference/ez2play.h STRUM_WINDOW_MS). */
export const STRUM_WINDOW_MS = (6 * 1000) / 60;

export class StrumLatch {
  private until: [number, number] = [-Infinity, -Infinity];

  /** A strum on `side` (0: player 1, 1: player 2) at `ms`: the latch is armed. */
  strum(side: 0 | 1, ms: number): void {
    this.until[side] = ms + STRUM_WINDOW_MS;
  }

  /** Whether a fret pressed at `ms` on `side` counts (the latch is still armed). */
  fires(side: 0 | 1, ms: number): boolean {
    return ms <= this.until[side];
  }

  reset(): void {
    this.until = [-Infinity, -Infinity];
  }
}
