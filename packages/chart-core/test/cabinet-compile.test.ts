// The cabinet compile profile (publish/chart-plan.ts `target: 'cabinet'`):
// the rules one by one, on small charts built here. Parity with the game's
// own charts, read back by EZ2PORT's parser, is cabinet.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { EZ_BPM, EZ_NOTE } from '../src/io/ez/ezff';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { compileChart, type ChartPlan } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { BackingAllocator } from '../src/publish/tracks';

// StreetMix (5k): lanes on tracks 3-7, 10 (scratch), 11 (pedal).
const R = 240;
const BEAT_FRAMES = 17640; // 0.4 s at 150 BPM, 44.1 kHz

function chart(notes: Partial<NoteRec>[], game?: Record<string, unknown>): ChartData {
  const c = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
  c.channels = [
    { id: 1, name: 'short.wav' }, // half a beat
    { id: 2, name: 'long.wav' }, // four beats
    { id: 3, name: 'endless.wav' }, // unknown length
  ];
  c.notes = notes.map((n, i) => ({ id: i + 1, ch: 1, x: 0, y: 0, l: 0, c: false, ...n }));
  if (game)
    c.extra.x_ez = {
      name: 'alpha',
      name2: '',
      bpm: 150,
      bpm2: 150,
      total_ticks: 4000,
      tracks: 23,
      ...game,
    };
  return c;
}

const frames: Record<string, number> = {
  'short.wav': BEAT_FRAMES / 2,
  'long.wav': BEAT_FRAMES * 4,
};

function compile(c: ChartData, target: 'port' | 'cabinet' = 'cabinet'): ChartPlan {
  return compileChart(c, {
    columns: modeDef('5k').columns,
    name: 'k',
    keysounds: new KeysoundRegistry(),
    samples: (src) => (src in frames ? { frames: frames[src]! } : undefined),
    target,
  });
}

/** Note id -> the track its record went on. */
const trackOf = (p: ChartPlan) => new Map(p.events.map((e) => [e.noteId, e.track]));
const notesOn = (p: ChartPlan, t: number) =>
  p.ezff.tracks[t]!.records.filter((r) => r.type === EZ_NOTE);

describe('cabinet: background tracks', () => {
  it("keeps the game's tracks and places new sounds around them, never over one", () => {
    const p = compile(
      chart(
        [
          { ch: 2, y: 0, extra: { x_track: 1 } }, // 1 A: the game's, beats 0-4 on track 1
          { ch: 1, y: 6 * R, extra: { x_track: 1 } }, // 2 B: the game's, beat 6 on track 1
          { ch: 1, y: 8 * R, extra: { x_track: 2 } }, // 3 C: the game's, beat 8 on track 2
          { ch: 1, y: R }, // 4 D: new, beat 1 - track 1 rings (A), 2 is free until C
          { ch: 1, y: 4 * R }, // 5 F: new, beat 4 - A has just ended, B is later: track 1
          { ch: 2, y: 5 * R }, // 6 E: new, beats 5-9 - it would ring into B and C: track 22
        ],
        {},
      ),
    );
    expect([...trackOf(p)].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 1],
      [6, 22],
    ]);
    expect(p.cabinet).toMatchObject({ pinned: 3, repinned: 0, pinnedCuts: 0, grown: 0 });
    expect(p.stats.chokes).toBe(0);
    expect(p.ezff.tracks).toHaveLength(23);
  });

  it("re-places a note whose track is a lane in this mode, and counts the game's own cuts", () => {
    const p = compile(
      chart(
        [
          { ch: 2, y: 0, extra: { x_track: 4 } }, // track 4 is a StreetMix lane
          { ch: 2, y: 0, extra: { x_track: 9 } },
          { ch: 1, y: R, extra: { x_track: 9 } }, // cuts the long sound on 9, as the game had it
        ],
        {},
      ),
    );
    expect(trackOf(p).get(1)).toBe(1);
    expect(trackOf(p).get(3)).toBe(9);
    expect(p.cabinet).toMatchObject({ pinned: 2, repinned: 1, pinnedCuts: 1 });
  });

  it('puts tracks with a kept volume change last, and grows the count rather than choke', () => {
    const vol = chart([{ ch: 1, y: 0 }], { tracks: 12 });
    vol.extra.x_ez_records = [{ track: 1, y: 0, type: 2, value: 40 }];
    expect(trackOf(compile(vol)).get(1)).toBe(2);

    // Twelve tracks: 1, 2, 8 and 9 are free for background; four endless sounds take them.
    const busy = chart(
      Array.from({ length: 6 }, (_, i) => ({ ch: 3, y: i * R })),
      { tracks: 12 },
    );
    const p = compile(busy);
    expect([...trackOf(p).values()]).toEqual([1, 2, 8, 9, 12, 13]);
    expect(p.cabinet!.grown).toBe(2);
    expect(p.stats.chokes).toBe(0);
    expect(p.ezff.tracks).toHaveLength(14);
  });

  it('never changes what EZ2PORT gets', () => {
    const c = chart(
      [
        { ch: 2, y: 0, extra: { x_track: 9, x_len: 40 } },
        { ch: 1, y: R },
      ],
      {
        tracks: 12,
      },
    );
    c.extra.x_ez_records = [{ track: 5, y: 0, type: 6, scroll: 2 }];
    const port = compile(c, 'port');
    expect(trackOf(port).get(1)).toBe(1);
    expect(port.cabinet).toBeUndefined();
    expect(port.ezff.tracks).toHaveLength(64);
    expect(notesOn(port, 1)[0]!.length).toBe(0);
    expect(port.ezff.tracks[5]!.records).toEqual([]);
  });
});

describe('cabinet: records, lengths and the header', () => {
  it('writes the kept records back, raw words first, a scroll by its f32 bits', () => {
    const c = chart([{ ch: 1, x: 11, y: 0 }], {});
    c.extra.x_ez_records = [
      { track: 0, y: 2 * R, type: 6, raw: [1073741824, 7], scroll: 2 },
      { track: 5, y: R, type: 6, scroll: 0.5 },
      { track: 1, y: 0, type: 2, value: 100 },
      { track: 9, y: 0, type: 4, value: 3 },
      { track: 12, y: 4 * R, type: 5 },
      { track: 13, y: R, type: 3, bpm: 1500 },
      { track: 14, y: R, type: 9, raw: [1, 2] },
      { track: 'x', y: 0, type: 6 }, // not a record: skipped
    ];
    const p = compile(c);
    const recs = (t: number) => p.ezff.tracks[t]!.records;
    expect(recs(0)).toContainEqual({ tick: 96, type: 6, raw: [1073741824, 7] });
    expect(recs(5)).toContainEqual({ tick: 48, type: 6, raw: [0x3f000000, 0] });
    expect(recs(1)).toEqual([{ tick: 0, type: 2, value: 100 }]);
    expect(recs(9)).toEqual([{ tick: 0, type: 4, value: 3 }]);
    expect(recs(12)).toEqual([{ tick: 192, type: 5 }]);
    expect(recs(13)).toEqual([{ tick: 48, type: 3, bpm: 1500 }]);
    expect(recs(14)).toEqual([{ tick: 48, type: 9, raw: [1, 2] }]);
    expect(p.cabinet!.kept).toBe(7);
  });

  it("writes a background note's and a lane tap's raw length back, never a stale one", () => {
    const p = compile(
      chart(
        [
          { ch: 1, y: 0, extra: { x_len: 20 } }, // background: kept
          { ch: 1, x: 11, y: 0, extra: { x_len: 3 } }, // lane tap 1-6: kept
          { ch: 1, x: 12, y: 0, l: 2 * R, extra: { x_len: 3 } }, // now a hold: its own length
          { ch: 1, x: 13, y: 0, extra: { x_len: 30 } }, // a tap cannot be 30: 0
        ],
        {},
      ),
    );
    const len = (id: number) => {
      const e = p.events.find((v) => v.noteId === id)!;
      return p.ezff.tracks[e.track]!.records.find((r) => r.tick === e.tick && r.type === EZ_NOTE)!
        .length;
    };
    expect([len(1), len(2), len(3), len(4)]).toEqual([20, 3, 6 + 96, 0]);
  });

  it("keeps the game's header - CP949 names, BPMs, length - and a changed start tempo as a record", () => {
    const c = chart([{ ch: 1, x: 11, y: 4 * R }], {
      name: '테스트 곡',
      name2: 'b',
      bpm: 150,
      bpm2: 151,
      total_ticks: 4000,
      last_tick: 3000,
      tracks: 23,
    });
    let p = compile(c);
    expect(new TextDecoder('euc-kr').decode(p.ezff.name)).toBe('테스트 곡');
    expect(p.ezff.bpm2).toBe(151);
    expect(p.ezff.totalTicks).toBe(4000);
    // No closing record: the game chart's end is its own.
    expect(p.ezff.tracks[0]!.records).toEqual([]);

    c.info.initBpm = 180;
    p = compile(c);
    expect(p.ezff.bpm).toBe(150);
    expect(p.ezff.tracks[0]!.records).toEqual([{ tick: 0, type: EZ_BPM, bpm: 180 }]);
    expect(p.tempo.bpmAt(0)).toBe(180);

    // Grown past the game's last record: long enough to hold it.
    c.notes.push({ id: 9, ch: 1, x: 12, y: 100 * R, l: 0, c: false });
    expect(compile(c).ezff.totalTicks).toBe(100 * 48);
  });

  it('gives a chart that did not come from the game the publish layout', () => {
    const p = compile(chart([{ ch: 1, x: 11, y: 4 * R }]));
    expect(p.ezff.tracks).toHaveLength(64);
    expect(p.ezff.tracks[0]!.records.at(-1)).toMatchObject({ type: EZ_BPM });
    expect(p.cabinet).toMatchObject({ pinned: 0, kept: 0 });
  });
});

describe('the backing allocator', () => {
  it('places in time order as it always has when nothing is pinned', () => {
    const a = new BackingAllocator(new Set([3, 4]), 8);
    const got = [0, 10, 20, 30, 40, 50, 60].map((ms, i) =>
      a.place({ tick: i, startMs: ms, durMs: 100 }),
    );
    // Pool: 1, 2, then 5-7 (8 tracks, 3 and 4 lanes); the sixth and seventh
    // choke on whichever track frees up first.
    expect(got).toEqual([1, 2, 5, 6, 7, 1, 2]);
    expect(a.chokes).toBe(2);
    expect(a.grown).toBe(0);
  });

  it('never puts two records on one track at one tick', () => {
    const a = new BackingAllocator(new Set(), 4);
    expect([0, 0, 0].map(() => a.place({ tick: 5, startMs: 0, durMs: 0 }))).toEqual([1, 2, 3]);
    expect(() => a.place({ tick: 5, startMs: 0, durMs: 0 })).toThrow(/tick 5/);
  });
});
