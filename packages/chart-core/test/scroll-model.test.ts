// Scroll changes in the model (timing/scroll.ts): the bmson member
// x_scroll_events and its byte stability, the edit command and its undo,
// rescale, the kept records of imports made before EZ2BMS had scroll
// changes (they still count, and a quick fix makes them the chart's own),
// the lint rules, and the cabinet getting the same type-6 records back.

import { describe, expect, it } from 'vitest';
import { setScrollAt } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { EZ_NOTE } from '../src/io/ez/ezff';
import { parseBmson } from '../src/io/bmson/parse';
import { serializeBmson } from '../src/io/bmson/serialize';
import { fixChart } from '../src/lint/fixes';
import { lintChart } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import type { ChartData } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { rescaleChart } from '../src/timing/rescale';
import { EZ_SCROLL_MAX, f32FromWord, scrollEventsOf, wordFromF32 } from '../src/timing/scroll';

const FILE = 'streetmix1p-abc.bmson';
const chart = (): ChartData => newChart({ mode: '5k', tier: 'NM', level: 3, title: 'T' });
const rules = (d: ChartData) =>
  lintChart({ file: FILE, data: d, mode: '5k', tier: 'NM' }).map((f) => f.rule);

/** Every non-note record of a cabinet compile, as `track tick type raw`. */
function cabinetRecords(d: ChartData): string[] {
  const plan = compileChart(d, {
    columns: modeDef('5k').columns,
    name: 'k',
    keysounds: new KeysoundRegistry(),
    samples: () => undefined,
    target: 'cabinet',
  });
  return plan.ezff.tracks
    .flatMap((t, ti) =>
      t.records
        .filter((r) => r.type !== EZ_NOTE && r.type !== 3)
        .map((r) => `${ti} ${r.tick} ${r.type} ${r.value ?? ''} ${r.raw ?? ''}`),
    )
    .sort();
}

describe('x_scroll_events in the bmson', () => {
  it('round-trips, with what an import keeps and members EZ2BMS does not know', () => {
    const d = chart();
    d.scrollEvents = [
      { y: 480, rate: 1.5 },
      { y: 960, rate: 0.75, extra: { x_track: 12, x_raw1: 0x1234, note: 'kept' } },
    ];
    const text = serializeBmson(d);
    const back = parseBmson(text);
    expect(back.warnings).toEqual([]);
    expect(back.chart.scrollEvents).toEqual(d.scrollEvents);
    expect(back.chart.extra).toEqual({});
    expect(serializeBmson(back.chart)).toBe(text);
  });

  it('is absent from charts without scroll changes, and an empty one stays', () => {
    const plain = serializeBmson(chart());
    expect(plain).not.toContain('x_scroll_events');
    expect(serializeBmson(parseBmson(plain).chart)).toBe(plain);

    const empty = chart();
    empty.extra.x_scroll_events = [];
    const text = serializeBmson(empty);
    const back = parseBmson(text).chart;
    expect(back.scrollEvents).toEqual([]);
    expect(serializeBmson(back)).toBe(text);
  });

  it('drops a change without a rate and keeps a member that is not a list as it was', () => {
    const d = chart();
    d.extra.x_scroll_events = [{ y: 0, rate: 2 }, { y: 240 }, { y: 480, rate: 'fast' }];
    const r = parseBmson(serializeBmson(d));
    expect(r.chart.scrollEvents).toEqual([{ y: 0, rate: 2 }]);
    expect(r.warnings.map((w) => w.path)).toEqual(['$.x_scroll_events[1]', '$.x_scroll_events[2]']);
    const odd = chart();
    odd.extra.x_scroll_events = { y: 0 };
    const o = parseBmson(serializeBmson(odd));
    expect(o.chart.scrollEvents).toEqual([]);
    expect(o.chart.extra.x_scroll_events).toEqual({ y: 0 });
    expect(o.warnings.map((w) => w.path)).toEqual(['$.x_scroll_events']);
  });

  it('reads them sorted', () => {
    const d = chart();
    d.extra.x_scroll_events = [
      { y: 960, rate: 2 },
      { y: 0, rate: 1.5 },
    ];
    expect(parseBmson(serializeBmson(d)).chart.scrollEvents.map((e) => e.y)).toEqual([0, 960]);
  });
});

describe('editing scroll changes', () => {
  it('sets, changes and removes one per position, each one undo step', () => {
    const doc = new ChartDoc(chart());
    setScrollAt(doc, 960, 2);
    setScrollAt(doc, 480, 1.1);
    expect(doc.data.scrollEvents).toEqual([
      { y: 480, rate: 1.1 },
      { y: 960, rate: 2 },
    ]);
    setScrollAt(doc, 960, 0.5);
    setScrollAt(doc, 480, null);
    expect(doc.data.scrollEvents).toEqual([{ y: 960, rate: 0.5 }]);
    const v = doc.version;
    doc.undo();
    expect(doc.data.scrollEvents).toHaveLength(2);
    expect(doc.version).toBeGreaterThan(v);
    doc.undo();
    doc.undo();
    doc.undo();
    expect(doc.data.scrollEvents).toEqual([]);
    for (let i = 0; i < 4; i++) doc.redo();
    expect(doc.data.scrollEvents).toEqual([{ y: 960, rate: 0.5 }]);
  });

  it('keeps the f32 it will publish, and what an imported change carries', () => {
    const d = chart();
    d.scrollEvents = [{ y: 240, rate: 2, extra: { x_track: 9, x_raw1: 7 } }];
    const doc = new ChartDoc(d);
    setScrollAt(doc, 240, 1 / 3);
    const e = doc.data.scrollEvents[0]!;
    expect(e.extra).toEqual({ x_track: 9, x_raw1: 7 });
    expect(Math.fround(e.rate)).toBe(Math.fround(1 / 3));
    expect(String(e.rate).length).toBeLessThan(12);
  });

  it('refuses a rate that is not above 0', () => {
    const doc = new ChartDoc(chart());
    for (const r of [0, -1, NaN, Infinity]) expect(() => setScrollAt(doc, 0, r)).toThrow();
    expect(doc.canUndo).toBe(false);
  });

  it('moves with a rescale, and so do the records an import kept', () => {
    const d = chart();
    d.scrollEvents = [{ y: 300, rate: 2 }];
    d.extra.x_ez_records = [
      { track: 1, y: 60, type: 2, value: 90 },
      { track: 0, y: 120, type: 6, raw: [wordFromF32(1.5), 0] },
    ];
    const r = rescaleChart(d, 480);
    expect(r.worstError).toBe(0);
    expect(d.scrollEvents[0]!.y).toBe(600);
    expect((d.extra.x_ez_records as { y: number }[]).map((k) => k.y)).toEqual([120, 240]);
  });
});

describe('scroll changes kept from an older import', () => {
  function legacy(): ChartData {
    const d = chart();
    d.scrollEvents = [{ y: 960, rate: 3 }];
    d.extra.x_ez_records = [
      { track: 1, y: 0, type: 2, value: 100 },
      // As the importer wrote them: the words and the decoded value.
      { track: 4, y: 480, type: 6, raw: [wordFromF32(1.25), 0x99], scroll: 1.25 },
      // Only the value (the words win when both are there).
      { track: 0, y: 1440, type: 6, scroll: 0.5 },
      // Not a number: not a scroll change the port could use.
      { track: 0, y: 1920, type: 6, raw: [0x7fc00000, 0] },
    ];
    return d;
  }

  it('play and publish with the chart’s own', () => {
    expect(
      scrollEventsOf(legacy()).map((s) => [s.y, s.rate, s.track, s.raw1, s.from.kind]),
    ).toEqual([
      [480, 1.25, 4, 0x99, 'legacy'],
      [960, 3, 0, 0, 'event'],
      [1440, 0.5, 0, 0, 'legacy'],
    ]);
  });

  it('become the chart’s own by a quick fix: one undo step, the same records for the cabinet', () => {
    const d = legacy();
    const before = cabinetRecords(d);
    expect(rules(d)).toContain('scroll-legacy');
    const doc = new ChartDoc(d);
    const saved = serializeBmson(doc.data);
    expect(fixChart(doc, '5k', 'scroll-legacy')).toBe(true);
    expect(doc.data.scrollEvents).toEqual([
      { y: 480, rate: 1.25, extra: { x_track: 4, x_raw1: 0x99 } },
      { y: 960, rate: 3 },
      { y: 1440, rate: 0.5 },
    ]);
    // The volume record and the one that is not a number stay kept.
    expect((doc.data.extra.x_ez_records as { type: number }[]).map((k) => k.type)).toEqual([2, 6]);
    expect(rules(doc.data)).not.toContain('scroll-legacy');
    expect(cabinetRecords(doc.data)).toEqual(before);
    expect(fixChart(doc, '5k', 'scroll-legacy')).toBe(false);
    doc.undo();
    expect(serializeBmson(doc.data)).toBe(saved);
  });

  it('leave no empty list behind', () => {
    const d = chart();
    d.extra.x_ez_records = [{ track: 0, y: 0, type: 6, scroll: 2 }];
    const doc = new ChartDoc(d);
    fixChart(doc, '5k', 'scroll-legacy');
    expect(doc.data.extra).not.toHaveProperty('x_ez_records');
    expect(doc.data.scrollEvents).toEqual([{ y: 0, rate: 2 }]);
  });
});

describe('lint', () => {
  it('refuses a rate that is not above 0 (a hand-edited file)', () => {
    const d = chart();
    d.scrollEvents = [{ y: 0, rate: 0 }];
    expect(rules(d)).toContain('scroll-rate');
  });

  it('warns about two different changes on one tick, and past what the port keeps', () => {
    const d = chart();
    d.scrollEvents = [
      { y: 480, rate: 2 },
      { y: 481, rate: 3 }, // the same 1/48-beat tick at resolution 240
    ];
    expect(rules(d)).toContain('scroll-same-tick');
    d.scrollEvents = [
      { y: 480, rate: 2 },
      { y: 481, rate: 2 },
    ];
    expect(rules(d)).not.toContain('scroll-same-tick');
    d.scrollEvents = Array.from({ length: EZ_SCROLL_MAX + 1 }, (_, i) => ({
      y: i * 5,
      rate: 1 + (i % 2),
    }));
    expect(rules(d)).toContain('scroll-count');
  });
});

describe('the cabinet', () => {
  it('gets each change as a type-6 record on its track, with its second word', () => {
    const d = chart();
    d.scrollEvents = [
      { y: 480, rate: 1.5 },
      { y: 960, rate: 0.1, extra: { x_track: 22, x_raw1: 0xdeadbeef } },
    ];
    const recs = cabinetRecords(d);
    expect(recs).toEqual(
      [`0 96 6  ${wordFromF32(1.5)},0`, `22 192 6  ${wordFromF32(0.1)},${0xdeadbeef}`].sort(),
    );
    expect(f32FromWord(wordFromF32(0.1))).toBe(Math.fround(0.1));
  });
});
