// The song-select wheel's arithmetic (ez2data/selectwheel.ts) against
// EZ2PORT's own (ez2/selectwheel.c through the oracle): every disc and title
// plate placed where the port places it, the scroll's chase frame for frame,
// the disc's swing between tiers frame for frame.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  railPlace,
  railSlots,
  selectWheel,
  swingTick,
  wheelChase,
  wheelPlace,
  wheelStep,
  wheelWantsPreview,
} from '../src/ez2data/selectwheel';
import { ORACLE, oracle } from './oracle';

const f = Math.fround;

describe.skipIf(!ORACLE)("the select wheel against EZ2PORT's", () => {
  it('places every disc and title plate where the port does', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 120 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (count, at) => {
          const scroll = f(f(at) * count * 100);
          const theirs = oracle<{
            place: [number, number, number, number, number][];
            rail: [number, number, number, number, number][];
          }>(['select-wheel', String(count), scroll.toPrecision(9)]);
          const w = selectWheel(count);
          w.scroll = f(Number(scroll.toPrecision(9)));
          const place: [number, number, number, number, number][] = [];
          for (let i = 0; i < w.count; i++) {
            const p = wheelPlace(w, i);
            if (p) place.push([i, p.x, p.y, p.size, p.bright]);
          }
          const rail: [number, number, number, number, number][] = [];
          for (let s = 0; s < railSlots(w); s++) {
            const r = railPlace(w, s);
            if (r) rail.push([s, r.entry, r.x, r.y, r.bright]);
          }
          const close = (a: number[][], b: number[][]) => {
            expect(a.map((r) => r[0])).toEqual(b.map((r) => r[0]));
            a.forEach((r, k) =>
              r.forEach((v, j) => {
                // Positions to a thousandth of a pixel (sinf against Math.sin
                // may part in the last bit); indices and brightness exactly.
                if (j === 1 || j === 2 || j === 3)
                  expect(Math.abs(v - b[k]![j]!)).toBeLessThan(1e-3);
                else expect(v).toBe(b[k]![j]);
              }),
            );
          };
          close(place, theirs.place);
          close(rail, theirs.rail);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('chases the cursor frame for frame, the short way round', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 80 }), fc.nat(), fc.nat(), (count, a, b) => {
        const [from, to] = [a % count, b % count];
        const theirs = oracle<number[]>([
          'select-chase',
          String(count),
          String(from),
          String(to),
          '90',
        ]);
        const w = selectWheel(count, from);
        w.cursor = to;
        const ours: number[] = [];
        for (let t = 0; t < 90; t++) {
          wheelChase(w);
          ours.push(w.scroll);
        }
        expect(ours).toEqual(theirs.map(f));
      }),
      { numRuns: 150 },
    );
  });

  it('swings the disc between tiers frame for frame', () => {
    const tiers = fc
      .array(fc.tuple(fc.constantFrom(0, 1, 3, 4), fc.integer({ min: 1, max: 40 })), {
        minLength: 1,
        maxLength: 8,
      })
      .map((runs) => runs.map(([d, n]) => String(d).repeat(n)).join(''));
    fc.assert(
      fc.property(tiers, (diffs) => {
        const theirs = oracle<[number, number][]>(['select-swing', diffs]);
        let angle = 0;
        let step = -30;
        const ours: [number, number][] = [];
        for (const ch of diffs) {
          [angle, step] = swingTick(Number(ch), angle, step);
          ours.push([angle, step]);
        }
        expect(ours).toEqual(theirs.map(([a, s]) => [f(a), f(s)]));
      }),
      { numRuns: 150 },
    );
  });
});

describe('the select wheel', () => {
  it('shows one disc at a time, at the focus (the cabinet does too)', () => {
    const w = selectWheel(40);
    const on = [...Array(40).keys()].map((i) => wheelPlace(w, i)).filter(Boolean);
    expect(on).toHaveLength(5);
    const focus = wheelPlace(w, 0)!;
    expect(focus.size).toBe(176);
    expect(focus.x).toBeCloseTo(473.56, 1);
    expect(focus.y).toBeCloseTo(231.19, 1);
  });

  it('repeats a short list down the rail, the focus at d 700', () => {
    const w = selectWheel(1);
    const rows = [...Array(railSlots(w)).keys()].map((s) => railPlace(w, s)).filter(Boolean);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r!.entry === 0)).toBe(true);
    expect(rows.some((r) => r!.bright === 255)).toBe(true);
  });

  it('steps with the cursor wrapped and the dwell restarted, as the buttons do', () => {
    const w = selectWheel(3);
    wheelStep(w, false, false);
    // Idle starts at the threshold: the song under the cursor previews at once.
    expect(wheelWantsPreview(w)).toBe(true);
    expect(wheelStep(w, false, true)).toBe(-1);
    expect(w.cursor).toBe(2);
    expect(wheelWantsPreview(w)).toBe(false);
    for (let t = 0; t < 29; t++) wheelStep(w, false, false);
    expect(wheelWantsPreview(w)).toBe(false);
    wheelStep(w, false, false);
    expect(wheelWantsPreview(w)).toBe(true);
    // A step each way cancels, and still restarts the dwell.
    expect(wheelStep(w, true, true)).toBe(0);
    expect(w.idle).toBe(1);
  });

  it('rests each tier a whole number of turns round', () => {
    for (const [d, rest] of [
      [0, 0],
      [1, 360],
      [3, 720],
      [4, 1080],
    ] as const) {
      let a = 0;
      let s = -30;
      for (let t = 0; t < 400; t++) [a, s] = swingTick(d, a, s);
      expect(a).toBeCloseTo(rest, 0);
    }
  });
});
