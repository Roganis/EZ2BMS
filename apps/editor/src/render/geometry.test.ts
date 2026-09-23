import { columnsFor, modeDef } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { computeLayout, laneAtX, RACK_GAP, RACK_SUB, STRIP_W, Viewport } from './geometry';

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
    rackGroups: [
      { key: 'drums', subLanes: 2 },
      { key: 'pad', subLanes: 1 },
    ],
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
          expect(l.rack.left + l.rack.width).toBeLessThanOrEqual(w + 1);
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

  it('lays rack groups side by side and scrolls a rack wider than its share', () => {
    const groups = Array.from({ length: 40 }, (_, i) => ({ key: `g${i}`, subLanes: 1 + (i % 3) }));
    const base = {
      width: 1200,
      height: 480,
      columns: columnsFor(modeDef('5k'), 'P1'),
      offModeXs: [],
    };
    const l = computeLayout({ ...base, rackGroups: groups, extras: 1 });
    const g = l.rack.groups;
    expect(g[1]!.left).toBeCloseTo(g[0]!.left + (1 * RACK_SUB + RACK_GAP) * l.scale, 9);
    expect(g[0]!.width).toBeCloseTo(RACK_SUB * l.scale, 9);
    // Forty groups do not fit in 40% of the window: it shows a part and scrolls.
    expect(l.rack.width).toBeLessThanOrEqual(0.4 * 1200 + 1);
    expect(l.rack.content).toBeGreaterThan(l.rack.width);
    const far = computeLayout({ ...base, rackGroups: groups, rackScroll: 1e9, extras: 1 });
    expect(far.rack.scroll).toBeCloseTo(far.rack.content - far.rack.width, 6);
    const last = far.rack.groups.at(-1)!;
    expect(last.left + last.width).toBeCloseTo(far.rack.left + far.rack.width, 6);
    expect(computeLayout({ ...base, rackGroups: [], extras: 1 }).rack.width).toBe(0);
  });

  it('puts stem strips between the lanes and the rack, and hides them in Play', () => {
    for (const [w, h] of [
      [1440, 900],
      [900, 700],
      [1920, 1080],
    ] as const) {
      for (const n of [1, 3, 4]) {
        const l = computeLayout({
          width: w,
          height: h,
          columns: columnsFor(modeDef('7k'), 'P1'),
          offModeXs: [21],
          strips: n,
          rackGroups: [{ key: 'drums', subLanes: 3 }],
          extras: 1,
        });
        expect(l.strips).toHaveLength(n);
        const first = l.strips[0]!;
        const lastLane = [...l.lanes, ...l.offLanes].at(-1)!;
        expect(first.left).toBeGreaterThanOrEqual(lastLane.left + lastLane.width);
        for (let i = 1; i < n; i++)
          expect(l.strips[i]!.left).toBeGreaterThan(l.strips[i - 1]!.left + l.strips[i - 1]!.width);
        const last = l.strips.at(-1)!;
        expect(l.rack.left).toBeGreaterThanOrEqual(last.left + last.width);
        expect(l.rack.left + l.rack.width).toBeLessThanOrEqual(w + 1);
        // They scale with the window, as everything does.
        expect(first.width).toBeCloseTo(STRIP_W * l.scale, 6);
      }
    }
    const play = computeLayout({
      width: 1440,
      height: 900,
      columns: columnsFor(modeDef('7k'), 'P1'),
      offModeXs: [],
      strips: 2,
      rackGroups: [],
      extras: 0,
    });
    expect(play.strips.every((g) => g.width === 0)).toBe(true);
  });
});
