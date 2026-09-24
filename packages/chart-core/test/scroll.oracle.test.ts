// Scroll changes against EZ2PORT's own code: the field's arithmetic
// (timing/scroll.ts, a transcription of ez2/scroll.c) against the oracle's
// `scroll` script on random inputs, bit for bit; and a published package's
// type-6 records read back by the port's chart parser, at the ticks and with
// the f32 words the chart says, with the stage still closed after the last
// sound when a change comes later.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EZ_NOTE, writeEzff } from '../src/io/ez/ezff';
import { newChart } from '../src/model/defaults';
import type { ChartData } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import {
  EZ_SCROLL_TYPE,
  multiplierAt,
  scrollChase,
  scrollEventsOf,
  scrollInit,
  scrollOffset,
  scrollPoints,
  scrollTarget,
  scrollY,
  wordFromF32,
  type ScrollState,
} from '../src/timing/scroll';
import { TickConverter } from '../src/timing/ticks';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const f = Math.fround;
const f32 = (min: number, max: number) =>
  fc.float({ min: f(min), max: f(max), noNaN: true, noDefaultInfinity: true });

type Op =
  | ['target', number, number]
  | ['init', number, number, number]
  | ['tick', number]
  | ['offset', number, number, number, number]
  | ['y', number, number, number, number, number];

const tick = fc.double({ min: -2000, max: 200000, noNaN: true, noDefaultInfinity: true });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.tuple(fc.constant('target' as const), fc.integer({ min: 0, max: 999 }), f32(-4, 30)),
  fc.tuple(
    fc.constant('init' as const),
    fc.constantFrom(f(1.6), f(1), f(0), f(2.25)),
    fc.constantFrom(48, 24, 0, 96),
    f32(0, 30),
  ),
  fc.tuple(fc.constant('tick' as const), f32(-2, 40)),
  fc.tuple(fc.constant('offset' as const), tick, tick, f32(0.5, 2.5), f32(0.5, 2.5)),
  fc.tuple(fc.constant('y' as const), f32(0, 480), tick, tick, f32(0.5, 2.5), f32(0.5, 2.5)),
);

/** What timing/scroll.ts answers for a script, from the oracle's starting state. */
function ours(ops: Op[]): number[] {
  let s: ScrollState = scrollInit(1.6, 48, 1);
  return ops.map((o) => {
    switch (o[0]) {
      case 'target':
        return scrollTarget(o[1], o[2]);
      case 'init':
        s = scrollInit(o[1], o[2], o[3]);
        return s.rate;
      case 'tick':
        s = { ...s, rate: scrollChase(s.rate, o[1]) };
        return s.rate;
      case 'offset':
        return scrollOffset(s, o[1], o[2], o[3], o[4]);
      case 'y':
        return scrollY(s, o[1], o[2], o[3], o[4], o[5]);
    }
  });
}

const num = (v: string | number) => (Object.is(v, -0) ? '-0' : String(v));
const script = (ops: Op[]) => ops.map((o) => o.map(num).join(' ')).join('\n') + '\n';
/** The oracle's answers: f32s printed with 9 digits, which read back to the same f32. */
const theirs = (ops: Op[]) => oracle<number[]>(['scroll'], script(ops)).map(f);

describe.skipIf(!ORACLE)('scroll arithmetic against ez2/scroll.c (oracle)', () => {
  it('target, chase, offset and y agree bit for bit on random scripts', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 80 }), (ops) => {
        expect(ours(ops)).toEqual(theirs(ops));
      }),
      { numRuns: 150 },
    );
  });

  it('a change from 1.0 to 1.5 at 250%, eased frame by frame, lands where the port does', () => {
    const ops: Op[] = [['init', f(1.6), 48, scrollTarget(250, 1)]];
    for (let i = 0; i < 120; i++) ops.push(['tick', scrollTarget(250, 1.5)]);
    ops.push(['offset', 480, 0, 1, 1]);
    const want = theirs(ops);
    expect(ours(ops)).toEqual(want);
    // It creeps up on 3.75 and never snaps to it (the original has no snap).
    expect(want[120]).toBeLessThanOrEqual(3.75);
    expect(want[120]).toBeGreaterThan(3.7499);
  });
});

describe('the multiplier the field chases', () => {
  it('is the last change at or before the tick, 1.0 before the first', () => {
    const pts = [
      { tick: 96, mult: 2 },
      { tick: 192, mult: f(0.5) },
      { tick: 192, mult: 3 },
    ];
    expect(multiplierAt(pts, 0)).toBe(1);
    expect(multiplierAt(pts, 95.99)).toBe(1);
    expect(multiplierAt(pts, 96)).toBe(2);
    expect(multiplierAt(pts, 191.5)).toBe(2);
    // Two at one tick: the one later in the list (the port's qsort does not
    // say; lint warns).
    expect(multiplierAt(pts, 192)).toBe(3);
    expect(multiplierAt([], 1e9)).toBe(1);
  });

  it('comes from the chart on the tick axis, STOP gaps included, as f32', () => {
    const c = newChart({ mode: '5k', tier: 'NM' });
    c.stopEvents = [{ y: 240, duration: 240 }];
    c.scrollEvents = [
      { y: 480, rate: 1.1 },
      { y: 120, rate: 2 },
    ];
    const tc = new TickConverter(240, c.stopEvents);
    const pts = scrollPoints(c, (y) => tc.tick(y).tick);
    expect(pts).toEqual([
      { tick: 24, mult: 2 },
      { tick: 144, mult: f(1.1) }, // two beats plus the STOP's beat
    ]);
  });
});

// ---- publishing -------------------------------------------------------------

interface OChart {
  tracks: { records: { tick: number; type: number; raw?: [number, number]; ms: number }[] }[];
}

const RATES = [0.25, 0.5, 1, 1.1, 1.5, 2, 3.75, 1 / 3];

/** A chart with notes, tempo changes, STOPs and scroll changes, some kept by an older import. */
const chartArb = fc
  .record({
    res: fc.constantFrom(240, 480, 192),
    bpms: fc.array(
      fc.tuple(fc.integer({ min: 1, max: 60 }), fc.constantFrom(90, 150, 174.5, 222)),
      { maxLength: 3 },
    ),
    stops: fc.array(fc.tuple(fc.integer({ min: 1, max: 60 }), fc.constantFrom(1, 2, 0.5)), {
      maxLength: 2,
    }),
    notes: fc.array(
      fc.tuple(fc.integer({ min: 0, max: 64 * 12 }), fc.constantFrom(11, 12, 13, 0)),
      {
        minLength: 1,
        maxLength: 30,
      },
    ),
    scroll: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 80 * 12 }), // 1/12 beats, past the last note too
        fc.constantFrom(...RATES),
        fc.boolean(), // kept by an older import
        fc.integer({ min: 0, max: 40 }),
      ),
      { minLength: 1, maxLength: 12 },
    ),
  })
  .map(({ res, bpms, stops, notes, scroll }) => {
    const c = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
    c.info.resolution = res;
    const q = (n: number) => Math.round((n * res) / 12);
    c.bpmEvents = bpms.map(([b, bpm]) => ({ y: b * res, bpm }));
    c.stopEvents = stops.map(([b, d]) => ({ y: b * res, duration: d * res }));
    c.channels = [{ id: 1, name: 'a.wav' }];
    c.notes = notes.map(([t, x], i) => ({ id: i + 1, ch: 1, x, y: q(t), l: 0, c: false }));
    const legacy: unknown[] = [];
    for (const [t, rate, old, track] of scroll) {
      if (old)
        legacy.push({ track, y: q(t), type: 6, raw: [wordFromF32(rate), 0], scroll: f(rate) });
      else if (!c.scrollEvents.some((e) => e.y === q(t)))
        c.scrollEvents.push({ y: q(t), rate, ...(track ? { extra: { x_track: track } } : {}) });
    }
    c.scrollEvents.sort((a, b) => a.y - b.y);
    if (legacy.length) c.extra.x_ez_records = legacy;
    return c;
  });

function publish(c: ChartData) {
  const plan = compileChart(c, {
    columns: modeDef('5k').columns,
    name: 'k',
    keysounds: new KeysoundRegistry(),
    samples: () => ({ frames: 44100 }),
  });
  return { plan, bytes: writeEzff(plan.ezff) };
}

describe.skipIf(!ORACLE)('a package carries the scroll changes (oracle)', () => {
  it('as type-6 records on track 0, at their ticks, with the same f32', () =>
    withTmpDir((dir) => {
      let n = 0;
      fc.assert(
        fc.property(chartArb, (c) => {
          const { bytes } = publish(c);
          const file = join(dir, `s${n++}.ez`);
          writeFileSync(file, bytes);
          const back = oracle<OChart>(['chart', file]);
          const tc = new TickConverter(c.info.resolution!, c.stopEvents);
          const want = scrollEventsOf(c)
            .map((s) => `${tc.tick(s.y).tick} ${wordFromF32(s.rate)}`)
            .sort();
          const got = back.tracks[0]!.records.filter((r) => r.type === EZ_SCROLL_TYPE).map(
            (r) => `${r.tick} ${r.raw![0]}`,
          );
          expect(got.sort()).toEqual(want);
          expect(
            back.tracks
              .slice(1)
              .flatMap((t) => t.records)
              .filter((r) => r.type === EZ_SCROLL_TYPE),
          ).toEqual([]);
        }),
        { numRuns: 60 },
      );
    }));

  it('and the stage still closes after the last sound when a change comes later', () =>
    withTmpDir((dir) => {
      const c = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
      c.channels = [{ id: 1, name: 'a.wav' }];
      c.notes = [{ id: 1, ch: 1, x: 11, y: 0, l: 0, c: false }];
      c.scrollEvents = [{ y: 240 * 4 * 8, rate: 2 }]; // eight measures on
      const { plan, bytes } = publish(c);
      const file = join(dir, 'late.ez');
      writeFileSync(file, bytes);
      const back = oracle<OChart>(['chart', file]);
      // The port takes type 6 out before it finds the end: what closes the
      // stage is the last other record, and it must be past the sound's end.
      const end = Math.max(
        ...back.tracks
          .flatMap((t) => t.records)
          .filter((r) => r.type !== 6)
          .map((r) => r.ms),
      );
      expect(end).toBeGreaterThanOrEqual(plan.endMs);
      expect(back.tracks[0]!.records.some((r) => r.type === EZ_NOTE)).toBe(false);
    }));
});
