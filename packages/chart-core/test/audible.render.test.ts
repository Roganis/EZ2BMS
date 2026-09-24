// The model against the mixer: whenever audible() says two charts sound the
// same, the real engine (crates/ez2bms-audio, rendering offline) must agree -
// at 44.1 kHz and at a device rate that is not. Random charts of stems, slice
// chains and one-shots get random edits of every kind; the edits the model
// calls silent must render within 1e-5 (the mixer may sum voices in another
// order, which moves the last float bits - one 16-bit step is 3.05e-5), and
// enough of the others must render audibly different to show the check can
// fail at all.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { fingerprint } from '../src/publish/audible';
import { compileChart, type SampleLookup } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { engineEvents } from '../src/publish/playback';
import { RENDER, renderPairs, type RenderCase } from './render';

/** Source names and their lengths in seconds. */
const SOUNDS: [string, number][] = [
  ['stem.wav', 5],
  ['pad.wav', 1.6],
  ['hit_1.wav', 0.25],
  ['hit_2.wav', 0.4],
];
const LANES = [0, 0, 0, 1, 11, 12, 13, 14, 15, 10];
const lookup: SampleLookup = (src) => {
  const s = SOUNDS.find(([n]) => n === src);
  return s ? { frames: Math.round(s[1] * 44100) } : undefined;
};

type Raw = { ch: number; y: number; x: number; c: boolean; vel: number };

const arbNote = fc.record({
  ch: fc.integer({ min: 1, max: SOUNDS.length + 1 }),
  y: fc.oneof(
    fc.integer({ min: 0, max: 32 }).map((k) => k * 60),
    fc.integer({ min: 0, max: 1920 }),
  ),
  x: fc.constantFrom(...LANES),
  c: fc.boolean(),
  vel: fc.constantFrom(127, 127, 127, 90),
});

type Edit =
  | { kind: 'lane'; i: number; x: number }
  | { kind: 'split'; ch: number; y: number; x: number }
  | { kind: 'drop'; i: number }
  | { kind: 'vel'; i: number }
  | { kind: 'move'; i: number; dy: number };

const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({ kind: fc.constant('lane' as const), i: fc.nat(), x: fc.constantFrom(...LANES) }),
  fc.record({
    kind: fc.constant('split' as const),
    ch: fc.integer({ min: 1, max: SOUNDS.length + 1 }),
    y: fc.integer({ min: 0, max: 1920 }),
    x: fc.constantFrom(...LANES),
  }),
  fc.record({ kind: fc.constant('drop' as const), i: fc.nat() }),
  fc.record({ kind: fc.constant('vel' as const), i: fc.nat() }),
  fc.record({ kind: fc.constant('move' as const), i: fc.nat(), dy: fc.constantFrom(-60, 60, 7) }),
);

const arbCase = fc.record({
  notes: fc.array(arbNote, { minLength: 1, maxLength: 24 }),
  stop: fc.option(fc.integer({ min: 1, max: 30 }).map((k) => ({ y: k * 60, duration: 120 }))),
  bpm2: fc.option(
    fc.record({
      y: fc.integer({ min: 1, max: 30 }).map((k) => k * 60),
      bpm: fc.constantFrom(90, 174),
    }),
  ),
  edit: arbEdit,
});

type Case = typeof arbCase extends fc.Arbitrary<infer T> ? T : never;

function build(c: Case): [ChartData, ChartData] {
  const base = newChart({ mode: '7k', tier: 'NM', level: 1, bpm: 150 });
  // Channel 5 names the pad again: two channels, one source.
  const channels = [
    ...SOUNDS.map(([name], i) => ({ id: i + 1, name })),
    { id: 5, name: 'pad.wav' },
  ];
  const notes: NoteRec[] = (c.notes as Raw[]).map((n, i) => ({ id: i + 1, ...n, l: 0 }));
  const chart: ChartData = {
    ...base,
    channels,
    notes,
    stopEvents: c.stop ? [c.stop] : [],
    bpmEvents: c.bpm2 ? [c.bpm2] : [],
  };
  const e = c.edit as Edit;
  const edited: NoteRec[] = notes.map((n) => ({ ...n }));
  const pick = (i: number) => edited[i % edited.length]!;
  switch (e.kind) {
    case 'lane':
      pick(e.i).x = e.x;
      break;
    case 'split':
      edited.push({ id: notes.length + 1, ch: e.ch, y: e.y, x: e.x, l: 0, c: true });
      break;
    case 'drop':
      edited.splice(e.i % edited.length, 1);
      break;
    case 'vel':
      pick(e.i).vel = pick(e.i).vel === 127 ? 64 : 127;
      break;
    case 'move':
      pick(e.i).y = Math.max(0, pick(e.i).y + e.dy);
      break;
  }
  return [chart, { ...chart, notes: edited }];
}

function events(chart: ChartData) {
  const reg = new KeysoundRegistry();
  const plan = compileChart(chart, {
    columns: modeDef('7k').columns,
    name: 'render',
    keysounds: reg,
    samples: lookup,
  });
  return engineEvents(plan, reg, (src) => {
    const i = SOUNDS.findIndex(([n]) => n === src);
    return i < 0 ? undefined : i;
  });
}

describe.skipIf(!RENDER)('audible() against the real mixer', () => {
  it('renders the same whenever the model says so', () => {
    const cases = fc.sample(arbCase, { numRuns: 120, seed: 20260923 });
    const pairs = cases.map((c) => build(c));
    const same = pairs.map(([a, b]) => fingerprint(a, lookup) === fingerprint(b, lookup));
    const jobs: RenderCase[] = [];
    for (const rate of [44100, 48000]) {
      const samples = SOUNDS.map(([, sec], i) => ({
        frames: Math.round(sec * rate),
        channels: 2 as const,
        seed: i + 1,
      }));
      for (const [a, b] of pairs) jobs.push({ rate, samples, a: events(a), b: events(b) });
    }
    const reports = renderPairs(jobs);
    let caught = 0;
    reports.forEach((r, k) => {
      const i = k % pairs.length;
      if (same[i]) {
        expect(r.max_diff, `case ${i} at ${jobs[k]!.rate} Hz`).toBeLessThan(1e-5);
      } else if (r.max_diff > 1e-3) caught++;
    });
    // Silent edits must actually occur, and so must audible ones.
    expect(same.filter(Boolean).length).toBeGreaterThan(20);
    expect(caught).toBeGreaterThan(20);
  });
});
