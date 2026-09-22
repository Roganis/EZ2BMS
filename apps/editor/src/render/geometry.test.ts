import { columnsFor, modeDef } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { computeLayout, laneAtX, packRack, Viewport } from './geometry';

const layout = (
  mode: Parameters<typeof modeDef>[0],
  side: 'P1' | 'P2',
  w = 1200,
  h = 800,
  extras = 1,
) =>
  computeLayout({
    width: w,
    height: h,
    columns: columnsFor(modeDef(mode), side),
    offModeXs: [],
    rackCols: 3,
    extras,
  });

describe('playfield geometry', () => {
  it('lays out every mode on both sides without overlap, inside the window', () => {
    for (const m of ['5k-only', 'scratch', 'ruby', '5k', '7k', '10k', '14k'] as const) {
      for (const side of ['P1', 'P2'] as const) {
        for (const [w, h] of [
          [1440, 900],
          [700, 900],
          [1920, 1080],
        ] as const) {
          const l = layout(m, side, w, h);
          expect(l.lanes.map((g) => g.x)).toEqual(columnsFor(modeDef(m), side).map((c) => c.x));
          for (let i = 1; i < l.lanes.length; i++) {
            expect(l.lanes[i]!.left).toBeGreaterThanOrEqual(
              l.lanes[i - 1]!.left + l.lanes[i - 1]!.width,
            );
          }
          expect(l.gutter.left).toBeGreaterThanOrEqual(0);
          expect(l.rack.left + l.rack.cols * l.rack.colWidth).toBeLessThanOrEqual(w + 1);
          expect(laneAtX(l, l.lanes[0]!.left + 1)?.x).toBe(l.lanes[0]!.x);
        }
      }
    }
  });

  it('puts the turntable on the outside for each side', () => {
    expect(layout('7k', 'P1').lanes[0]!.kind).toBe('scratch');
    expect(layout('7k', 'P2').lanes.at(-1)!.kind).toBe('scratch');
  });

  it('keeps one beat the same height everywhere and maps pixels back to pulses', () => {
    const v = new Viewport(240, 960, 120, 700);
    expect(v.yOf(960)).toBe(700);
    expect(v.yOf(1200) - v.yOf(1440)).toBe(v.yOf(960) - v.yOf(1200));
    expect(v.pulseOf(v.yOf(1234))).toBeCloseTo(1234, 9);
    const [lo, hi] = v.visible(800);
    expect(lo).toBeLessThan(960);
    expect(hi).toBeGreaterThan(960);
  });

  it('packs background sounds into the fewest sub-columns', () => {
    const cols = packRack(
      [
        { id: 1, y: 0, l: 0 },
        { id: 2, y: 0, l: 0 },
        { id: 3, y: 60, l: 0 },
        { id: 4, y: 10, l: 200 },
      ],
      60,
    );
    expect([cols.get(1), cols.get(2), cols.get(4), cols.get(3)]).toEqual([0, 1, 2, 0]);
  });
});
