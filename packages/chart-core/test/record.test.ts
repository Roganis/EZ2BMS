// Takes (edit/record.ts): presses snapped to the grid, what a take would do,
// and a take applied as one undo step - with a brush sound, or in a Classic
// song keying what plays, with the music exactly as it was.

import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { placeNote } from '../src/edit/commands';
import { applyTake, previewTake, snapTake, takeStats, type TakePress } from '../src/edit/record';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import type { NoteRec } from '../src/model/types';
import { fingerprint } from '../src/publish/audible';
import type { SampleLookup } from '../src/publish/chart-plan';
import { timelineOf } from '../src/slice/view';

// 150 BPM, 240 pulses a beat: a beat is 400 ms, a 1/16 step (60 pulses) 100 ms.
const LEN: Record<string, number> = { 'stem.wav': 12, 'kick.wav': 0.2 };
const samples: SampleLookup = (src) =>
  LEN[src] === undefined ? undefined : { frames: Math.round(LEN[src]! * 44100) };

function doc(notes: [ch: number, y: number, x: number, c: boolean][] = []) {
  const data = newChart({ mode: '7k', tier: 'NM', level: 1, bpm: 150 });
  data.channels = [
    { id: 1, name: 'stem.wav' },
    { id: 2, name: 'kick.wav' },
  ];
  data.notes = notes.map(([ch, y, x, c], i): NoteRec => ({ id: i + 1, ch, y, x, l: 0, c }));
  return new ChartDoc(data);
}

/** The stem from the start, sliced every beat for 8 beats, all in the background. */
const stemSong = () =>
  doc(Array.from({ length: 8 }, (_, b) => [1, b * 240, 0, b > 0] as const).map((n) => [...n]));

const state = (d: ChartDoc) =>
  JSON.stringify({
    text: serializeBmson(d.data),
    notes: [...d.data.notes].sort((a, b) => a.id - b.id),
  });

describe('ChartDoc.group', () => {
  it('records many transactions as one undo step, notifying each', () => {
    const d = doc();
    const before = state(d);
    let events = 0;
    d.onChange(() => events++);
    d.group('three', () => {
      for (const y of [0, 240, 480]) placeNote(d, { x: 11, y, ch: 2 });
      // Each inner change is already visible to the next.
      expect(d.data.notes).toHaveLength(3);
    });
    expect(events).toBeGreaterThanOrEqual(3);
    expect(d.canUndo).toBe(true);
    d.undo();
    expect(state(d)).toBe(before);
    d.redo();
    expect(d.data.notes).toHaveLength(3);
    d.undo();
    expect(d.canUndo).toBe(false);
  });

  it('rolls every inner change back when it throws, and nests', () => {
    const d = doc();
    const before = state(d);
    expect(() =>
      d.group('broken', () => {
        placeNote(d, { x: 11, y: 0, ch: 2 });
        d.group('inner', () => placeNote(d, { x: 12, y: 0, ch: 2 }));
        throw new Error('no');
      }),
    ).toThrow('no');
    expect(state(d)).toBe(before);
    expect(d.canUndo).toBe(false);
  });
});

describe('snapping a take', () => {
  const tl = () => timelineOf(doc());
  const opts = { step: 60, holds: true, holdMinMs: 200 };

  it('puts each press on its nearest step and keeps how far off it was', () => {
    const notes = snapTake(
      [
        { x: 11, downMs: 405, upMs: 450 },
        { x: 12, downMs: 790, upMs: 1210 },
        { x: 13, downMs: 1000, upMs: 1150 },
        // A second press onto the same step of a lane is the same note.
        { x: 11, downMs: 420, upMs: 440 },
      ],
      tl(),
      opts,
    );
    expect(notes).toEqual([
      { x: 11, y: 240, l: 0, offsetMs: 5 },
      { x: 12, y: 480, l: 240, offsetMs: -10 },
      // Held 150 ms: under the hold threshold, a tap.
      { x: 13, y: 600, l: 0, offsetMs: 0 },
    ]);
    expect(
      snapTake([{ x: 12, downMs: 790, upMs: 1210 }], tl(), { ...opts, holds: false })[0]!.l,
    ).toBe(0);
    // Still held at stop: a tap. Before the start: dropped.
    expect(snapTake([{ x: 11, downMs: 800 }], tl(), opts)[0]!.l).toBe(0);
    expect(snapTake([{ x: 11, downMs: 380 }], tl(), { ...opts, fromPulse: 480 })).toEqual([]);
  });

  it('says how the take sat against the grid', () => {
    const presses: TakePress[] = [400, 812, 1190, 1606].map((downMs) => ({ x: 11, downMs }));
    expect(takeStats(snapTake(presses, tl(), opts))).toEqual({
      count: 4,
      meanMs: (0 + 12 - 10 + 6) / 4,
      medianMs: 3,
      early: 1,
      late: 2,
    });
  });
});

describe('applying a take', () => {
  it('with the brush: places what it can, counts clashes, one undo', () => {
    const d = doc([[2, 480, 12, false]]);
    const before = state(d);
    const notes = [
      { x: 11, y: 0, l: 0, offsetMs: 0 },
      { x: 12, y: 480, l: 0, offsetMs: 0 },
      // A hold over the note at 480 on lane 12... shortened to a tap.
      { x: 12, y: 240, l: 480, offsetMs: 0 },
      { x: 13, y: 240, l: 240, offsetMs: 0 },
    ];
    expect(previewTake(d, notes, { brush: 2 })).toEqual(['ok', 'clash', 'ok', 'ok']);
    const r = applyTake(d, notes, { brush: 2 });
    expect(r).toMatchObject({ placed: 3, clash: 1, shortened: 1, silent: 0, refused: 0 });
    expect(d.data.notes.find((n) => n.x === 12 && n.y === 240)!.l).toBe(0);
    expect(d.data.notes.find((n) => n.x === 13)!.l).toBe(240);
    expect([...d.selection.ids].sort()).toEqual([...r.ids].sort());
    d.undo();
    expect(state(d)).toBe(before);
  });

  it('in a Classic song: keys what plays, sounding exactly the same; one undo', () => {
    const d = stemSong();
    const before = state(d);
    const sound = fingerprint(d.data, samples);
    const env = { samples, brush: 1 };
    const notes = [
      // On a slice: the background note there is keyed.
      { x: 11, y: 240, l: 0, offsetMs: 0 },
      // Between slices: the stem is split there.
      { x: 12, y: 360, l: 0, offsetMs: 0 },
      { x: 13, y: 600, l: 0, offsetMs: 0 },
      // Past the stem's 12 s: nothing plays there.
      { x: 11, y: 240 * 40, l: 0, offsetMs: 0 },
    ];
    expect(previewTake(d, notes, { classic: env })).toEqual(['ok', 'ok', 'ok', 'silent']);
    const r = applyTake(d, notes, { classic: env });
    expect(r).toMatchObject({ placed: 3, silent: 1, clash: 0 });
    expect(r.splits).toHaveLength(2);
    expect(fingerprint(d.data, samples)).toBe(sound);
    expect(d.data.notes.filter((n) => n.x === 11 && n.y === 240)).toHaveLength(1);
    d.undo();
    expect(state(d)).toBe(before);
    d.redo();
    expect(fingerprint(d.data, samples)).toBe(sound);
  });
});
