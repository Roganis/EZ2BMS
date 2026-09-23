// MIDI: the file (io/midi/smf.ts) and cutting a stem at its notes
// (slice/midi.ts). The files are written here, byte by byte.
import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { parseSmf, smfMs, SmfError } from '../src/io/midi/smf';
import { newChart } from '../src/model/defaults';
import type { NoteRec } from '../src/model/types';
import { fingerprint } from '../src/publish/audible';
import type { SampleLookup } from '../src/publish/chart-plan';
import { applyMidiCuts, planMidiCuts, type MidiCutPlan } from '../src/slice/midi';
import type { SliceEnv } from '../src/slice/ops';

// ---- writing SMF --------------------------------------------------------------------

const vlq = (v: number) => {
  const out = [v & 0x7f];
  while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16 = (v: number) => [(v >> 8) & 255, v & 255];
const chunk = (tag: string, data: number[]) => [
  ...[...tag].map((c) => c.charCodeAt(0)),
  ...u32(data.length),
  ...data,
];
const tempo = (bpm: number) => {
  const us = Math.round(60_000_000 / bpm);
  return [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
};
/** A track from [delta, event bytes] pairs, ended. */
const track = (events: [number, number[]][]) =>
  chunk('MTrk', [...events.flatMap(([d, e]) => [...vlq(d), ...e]), 0, 0xff, 0x2f, 0]);
const smf = (format: number, ppq: number, tracks: number[][]) =>
  new Uint8Array([
    ...chunk('MThd', [...u16(format), ...u16(tracks.length), ...u16(ppq)]),
    ...tracks.flat(),
  ]);

describe('MIDI files', () => {
  it('reads note-ons (running status, velocity-0 offs), tempo and track names', () => {
    const conductor = track([
      [0, [0xff, 0x03, 4, ...'Tmpo'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c))],
      [0, tempo(150)],
      [1920, tempo(100)],
    ]);
    const drums = track([
      [0, [0x99, 36, 100]], // note on, channel 10
      [240, [38, 90]], // running status
      [0, [36, 0]], // velocity 0: an off
      [0, [0xf0, 2, 1, 0xf7]], // sysex
      [240, [0x89, 38, 0]], // note off
      [0, [0x99, 42, 80]],
    ]);
    const m = parseSmf(smf(1, 480, [conductor, drums]));
    expect(m.format).toBe(1);
    expect(m.ppq).toBe(480);
    expect(m.tracks.map((t) => [t.name, t.notes, t.channels])).toEqual([
      ['Tmpo', 0, []],
      ['', 3, [9]],
    ]);
    expect(m.notes.map((n) => [n.tick, n.key])).toEqual([
      [0, 36],
      [240, 38],
      [480, 42],
    ]);
    expect(m.tempos).toEqual([
      { tick: 0, usPerQuarter: 400000 },
      { tick: 1920, usPerQuarter: 600000 },
    ]);
    // 4 beats at 150 then half a beat at 100.
    expect(smfMs(m, 1920 + 240)).toBeCloseTo(1600 + 300, 9);
  });

  it('starts at 120 BPM without a tempo, unwraps RMID, and refuses what has no one tempo', () => {
    const plain = smf(0, 96, [track([[96, [0x90, 60, 64]]])]);
    const m = parseSmf(plain);
    expect(m.tempos).toEqual([{ tick: 0, usPerQuarter: 500000 }]);
    expect(smfMs(m, 96)).toBe(500);
    const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
    const rmid = new Uint8Array([
      ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
      ...le32(4 + 8 + plain.length),
      ...'RMIDdata'.split('').map((c) => c.charCodeAt(0)),
      ...le32(plain.length),
      ...plain,
    ]);
    expect(parseSmf(rmid).notes).toHaveLength(1);
    expect(() => parseSmf(smf(2, 96, []))).toThrow(SmfError);
    expect(() => parseSmf(new Uint8Array([...chunk('MThd', [0, 0, 0, 1, 0xe7, 0x28])]))).toThrow(
      /SMPTE/,
    );
    expect(() => parseSmf(new Uint8Array([1, 2, 3]))).toThrow(/not a MIDI/);
  });
});

// ---- cutting a stem ------------------------------------------------------------------

// 150 BPM, 240 pulses a beat: a beat is 400 ms.
const samples: SampleLookup = (src) =>
  src === 'stem.wav' ? { frames: 44100 * 12 } : src === 'kick.wav' ? { frames: 4410 } : undefined;
const env: SliceEnv = { samples };

function doc(extra: NoteRec[] = []) {
  const data = newChart({ mode: '5k', tier: 'NM', level: 1, bpm: 150 });
  data.channels = [
    { id: 1, name: 'stem.wav' },
    { id: 2, name: 'kick.wav' },
  ];
  // The stem starts on beat 1.
  data.notes = [{ id: 1, ch: 1, x: 0, y: 240, l: 0, c: false }, ...extra];
  return new ChartDoc(data);
}

/** Eighth notes at `bpm` (ppq 480), `n` of them, one off the grid. */
const eighths = (bpm: number, n: number, change?: { at: number; bpm: number }) =>
  parseSmf(
    smf(1, 480, [
      track([
        [0, tempo(bpm)],
        ...(change ? ([[change.at, tempo(change.bpm)]] as [number, number[]][]) : []),
      ]),
      track(
        Array.from({ length: n }, (_, i): [number, number[]] => [i ? 240 : 0, [0x90, 36, 100]]),
      ),
    ]),
  );

const cutsOf = (d: ChartDoc) =>
  d.data.notes
    .filter((n) => n.ch === 1 && n.c)
    .map((n) => n.y)
    .sort((a, b) => a - b);

describe("cutting a stem at a MIDI file's notes", () => {
  it("keeps the chart's tempo and cuts where the notes sound, as one undo step", () => {
    const d = doc();
    const sound = fingerprint(d.data, samples);
    const plan = planMidiCuts(d, 'stem.wav', eighths(150, 8), { tempo: 'chart' }) as MidiCutPlan;
    expect(plan.start).toBe(240);
    // Eighths at 150 BPM are half beats: 120 pulses apart from the stem's hit.
    expect(plan.ys).toEqual([360, 480, 600, 720, 840, 960, 1080]);
    expect(plan.worstMs).toBeLessThan(1e-6);
    const r = applyMidiCuts(d, 'stem.wav', plan, env);
    expect(r.ok).toBe(true);
    expect(cutsOf(d)).toEqual(plan.ys);
    expect(fingerprint(d.data, samples)).toBe(sound);
    d.undo();
    expect(cutsOf(d)).toEqual([]);
  });

  it("takes the MIDI's tempo from the stem's hit, and says what else it moves", () => {
    // A kick charted after the hit moves with the new tempo.
    const d = doc([{ id: 2, ch: 2, x: 11, y: 2400, l: 0, c: false }]);
    const plan = planMidiCuts(d, 'stem.wav', eighths(120, 6, { at: 960, bpm: 140 }), {
      tempo: 'midi',
    }) as MidiCutPlan;
    expect(plan.tempo!.events).toEqual([
      { y: 240, bpm: 120 },
      { y: 240 + 480, bpm: 140 },
    ]);
    expect(plan.moves).toBe(1);
    // A MIDI quarter is a beat: eighths are 120 pulses apart.
    expect(plan.ys).toEqual([360, 480, 600, 720, 840]);
    const r = applyMidiCuts(d, 'stem.wav', plan, env);
    expect(r.ok).toBe(true);
    expect(d.data.bpmEvents).toEqual([
      { y: 240, bpm: 120 },
      { y: 720, bpm: 140 },
    ]);
    expect(cutsOf(d)).toEqual(plan.ys);
    // The tempo and the cuts are one step.
    d.undo();
    expect(d.data.bpmEvents).toEqual([]);
    expect(cutsOf(d)).toEqual([]);
  });

  it('snaps to the nearest 1/48 beat, or a grid, and says how far', () => {
    // A note at a 7/480 of a quarter, off every EZ2 grid.
    const m = parseSmf(
      smf(0, 480, [
        track([
          [0, tempo(150)],
          [0, [0x90, 36, 1]],
          [7, [0x90, 37, 1]],
          [473, [0x90, 38, 1]],
        ]),
      ]),
    );
    const d = doc();
    const fine = planMidiCuts(d, 'stem.wav', m, { tempo: 'chart' }) as MidiCutPlan;
    // 7 ticks is 3.5 pulses: 5 pulses (1/48 beat) is nearest.
    expect(fine.ys).toEqual([245, 480]);
    expect(fine.worstMs).toBeCloseTo((1.5 / 240) * 400, 6);
    const grid = planMidiCuts(d, 'stem.wav', m, { tempo: 'chart', step: 60 }) as MidiCutPlan;
    // On a sixteenth grid the off note lands on the hit itself, and is merged away.
    expect(grid.ys).toEqual([480]);
  });

  it('refuses, changing nothing, where the stem is not playing', () => {
    const d = doc();
    const before = JSON.stringify(d.data);
    // Notes long after the 12 s stem has ended.
    const late = parseSmf(
      smf(0, 480, [
        track([
          [0, tempo(150)],
          [480 * 40, [0x90, 36, 1]],
        ]),
      ]),
    );
    const plan = planMidiCuts(d, 'stem.wav', late, { tempo: 'midi' }) as MidiCutPlan;
    const r = applyMidiCuts(d, 'stem.wav', plan, env);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(d.data)).toBe(before);
    expect(planMidiCuts(doc([]), 'kick.wav', late, { tempo: 'chart' })).toEqual({
      error: 'kick.wav has no hit in this chart to start the MIDI from',
    });
  });
});
