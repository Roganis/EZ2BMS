import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BGM } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { fingerprint } from '../src/publish/audible';
import { compileChart, type SampleLookup } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { engineEvents } from '../src/publish/playback';
import {
  applyCuts,
  chopPlan,
  chopToGrid,
  onsetSuggestions,
  planCuts,
  sliceHeal,
  sliceKey,
  sliceMove,
  sliceSplit,
  type SliceEnv,
} from '../src/slice/ops';
import { heardAt, sliceAt, stemView, whenHeard } from '../src/slice/view';
import { RENDER, renderPairs, type RenderCase } from './render';

// 150 BPM, 240 pulses a beat: a beat is 400 ms, a measure 1.6 s.
const LEN: Record<string, number> = { 'stem.wav': 12, 'loop.wav': 1.6, 'hit.wav': 0.2 };
const samples: SampleLookup = (src) =>
  LEN[src] === undefined ? undefined : { frames: Math.round(LEN[src]! * 44100) };
const env: SliceEnv = { samples };

type N = [ch: number, y: number, x: number, c: boolean, vel?: number];

function makeDoc(
  notes: N[],
  names = ['stem.wav', 'loop.wav', 'hit.wav'],
  timing: Partial<Pick<ChartData, 'stopEvents' | 'bpmEvents'>> = {},
) {
  const data = { ...newChart({ mode: '7k', tier: 'NM', level: 1, bpm: 150 }), ...timing };
  data.channels = names.map((name, i) => ({ id: i + 1, name }));
  data.notes = notes.map(([ch, y, x, c, vel], i): NoteRec => ({
    id: i + 1,
    ch,
    y,
    x,
    l: 0,
    c,
    ...(vel ? { vel } : {}),
  }));
  return new ChartDoc(data);
}

const state = (doc: ChartDoc) =>
  JSON.stringify({
    text: serializeBmson(doc.data),
    notes: [...doc.data.notes].sort((a, b) => a.id - b.id),
  });

const ys = (doc: ChartDoc, ch = 1) => doc.index.channel(ch).map((n) => n.y);

describe('a stem as the chart plays it', () => {
  it('is its notes as slices of the file, and one stretch of sound', () => {
    const doc = makeDoc([
      [1, 0, 0, false],
      [1, 960, 0, true],
      [1, 1920, 13, true],
    ]);
    const v = stemView(doc, 'stem.wav', samples);
    expect(v.slices.map((s) => [s.y, s.fresh, s.keyed, s.index])).toEqual([
      [0, true, false, 0],
      [960, false, false, 1],
      [1920, false, true, 2],
    ]);
    expect(v.slices.map((s) => [s.fromSec, s.toSec])).toEqual([
      [0, 1.6],
      [1.6, 3.2],
      [3.2, null],
    ]);
    expect(v.seconds).toBe(12);
    // Three slices, one sound: they join sample-exactly.
    expect(v.segments).toHaveLength(1);
    expect(heardAt(v, 2000)).toEqual([{ seg: v.segments[0], sec: 2 }]);
    expect(heardAt(v, 12_500)).toEqual([]);
    expect(sliceAt(v, 2000)!.y).toBe(960);
    expect(whenHeard(v, 5)).toEqual([5000]);
  });

  it('is heard again from its start when a fresh hit retriggers it', () => {
    // A 1.6 s loop struck every two beats: each hit cuts the last.
    const doc = makeDoc([
      [2, 0, 0, false],
      [2, 480, 0, false],
    ]);
    const v = stemView(doc, 'loop.wav', samples);
    expect(v.segments.map((s) => [s.fromMs, s.toMs])).toEqual([
      [0, 800],
      [800, null],
    ]);
    expect(whenHeard(v, 0.5)).toEqual([500, 1300]);
    expect(whenHeard(v, 1)).toEqual([1800]);
    expect(heardAt(v, 900).map((h) => h.sec)).toEqual([expect.closeTo(0.1, 9)]);
  });

  it('follows the tempo map, STOPs as gaps, back to positions', () => {
    // 150 BPM, then 300 from beat 4; a 120-pulse STOP (200 ms) at beat 2 before it.
    const doc = makeDoc([[1, 0, 0, false]], undefined, {
      bpmEvents: [{ y: 960, bpm: 300 }],
      stopEvents: [{ y: 480, duration: 120 }],
    });
    const on = (sec: number) =>
      onsetSuggestions(doc, 'stem.wav', [{ sec, strength: 1 }], { step: 60, exact: true }, env);
    // 0.6 s: before the STOP, 1.5 beats.
    expect(on(0.6).map((s) => s.y)).toEqual([360]);
    // 1.2 s: 200 ms after the gap (800-1000 ms): half a beat past it.
    expect(on(1.2).map((s) => s.y)).toEqual([600]);
    // 2.2 s: beat 4 is at 1.8 s (1.6 s plus the gap), then 0.4 s at 300 BPM is 2 beats.
    expect(on(2.2).map((s) => s.y)).toEqual([1440]);
  });

  it('knows nothing past its last note when the length is unknown', () => {
    const doc = makeDoc([[1, 0, 0, false]]);
    expect(stemView(doc, 'stem.wav').seconds).toBeUndefined();
    expect(chopPlan(doc, 'stem.wav', 0, 7200, 240)).toEqual([]);
    expect(chopPlan(doc, 'stem.wav', 0, 7200, 240, env)).toHaveLength(29);
  });
});

describe('slicing a stem', () => {
  const stem = () =>
    makeDoc([
      [1, 0, 0, false, 90],
      [1, 960, 0, true, 90],
      [3, 240, 0, false],
    ]);

  it('cuts where it plays, copying the level, and heals back', () => {
    const doc = stem();
    const sound = fingerprint(doc.data, samples);
    const r = sliceSplit(doc, 'stem.wav', 480, env);
    expect(r.ok).toBe(true);
    const cut = doc.index.get(r.ids![0]!)!;
    expect(cut).toMatchObject({ ch: 1, x: BGM, y: 480, c: true, vel: 90 });
    expect(fingerprint(doc.data, samples)).toBe(sound);
    expect(sliceSplit(doc, 'stem.wav', 480, env)).toMatchObject({
      ok: false,
      reason: 'it is already cut there',
    });
    // 12 s of stem at 150 BPM runs out at y 7200.
    expect(sliceSplit(doc, 'stem.wav', 7300, env)).toMatchObject({
      ok: false,
      reason: 'stem.wav is not playing there',
    });
    expect(sliceHeal(doc, cut.id, env).ok).toBe(true);
    expect(ys(doc)).toEqual([0, 960]);
    expect(fingerprint(doc.data, samples)).toBe(sound);
  });

  it('moves a cut between its neighbours, never where the sound starts', () => {
    const doc = stem();
    const sound = fingerprint(doc.data, samples);
    expect(sliceMove(doc, 2, 1200, env).ok).toBe(true);
    expect(ys(doc)).toEqual([0, 1200]);
    expect(fingerprint(doc.data, samples)).toBe(sound);
    expect(sliceMove(doc, 1, 60, env)).toMatchObject({ ok: false });
    sliceSplit(doc, 'stem.wav', 2400, env);
    expect(sliceMove(doc, 2, 2400, env).ok).toBe(false);
    expect(sliceMove(doc, 2, 0, env).ok).toBe(false);
    expect(ys(doc)).toEqual([0, 1200, 2400]);
  });

  it('puts slices on a lane at their own spot, and back', () => {
    const doc = stem();
    const sound = fingerprint(doc.data, samples);
    expect(sliceKey(doc, [2], 13, env).ok).toBe(true);
    expect(doc.index.get(2)).toMatchObject({ x: 13, y: 960 });
    expect([...doc.selection.ids]).toEqual([2]);
    expect(fingerprint(doc.data, samples)).toBe(sound);
    // Several at once, other sounds too; where the sound starts as well.
    const r = sliceSplit(doc, 'stem.wav', 480, env);
    expect(sliceKey(doc, [r.ids![0]!, 3], 13, env).ok).toBe(true);
    expect(sliceKey(doc, [1], 13, env).ok).toBe(true);
    // The hit is on lane 13 at 240: a slice cut there cannot go there too.
    const at240 = sliceSplit(doc, 'stem.wav', 240, env).ids![0]!;
    expect(sliceKey(doc, [at240], 13, env)).toMatchObject({ ok: false });
    expect(sliceKey(doc, [2], BGM, env).ok).toBe(true);
    expect(doc.index.get(2)).toMatchObject({ x: BGM, l: 0 });
    expect(fingerprint(doc.data, samples)).toBe(sound);
  });

  it('chops to the grid in one step, once', () => {
    const doc = stem();
    const sound = fingerprint(doc.data, samples);
    const before = state(doc);
    // Measures 1-2 at quarters: 240..1680, less the cut at 960.
    const r = chopToGrid(doc, 'stem.wav', 240, 1920, 240, env);
    expect(r.ok).toBe(true);
    expect(ys(doc)).toEqual([0, 240, 480, 720, 960, 1200, 1440, 1680]);
    expect(doc.index.get(r.ids![0]!)!.vel).toBe(90);
    expect(fingerprint(doc.data, samples)).toBe(sound);
    expect(chopPlan(doc, 'stem.wav', 240, 1920, 240, env)).toEqual([]);
    doc.undo();
    expect(state(doc)).toBe(before);
  });

  it('leaves silence on the end of the slice before', () => {
    const doc = stem();
    // Seconds 4-6 of the stem are silent: steps starting there stay uncut.
    const isSilent = (from: number, to: number) => from >= 4 - 1e-9 && to <= 6 + 1e-9;
    const all = chopPlan(doc, 'stem.wav', 0, 7200, 240, env);
    const cut = chopPlan(doc, 'stem.wav', 0, 7200, 240, env, { isSilent });
    expect(all).toHaveLength(28);
    expect(cut.map((c) => c.y)).toEqual(all.map((c) => c.y).filter((y) => y < 2400 || y >= 3600));
    // Ids are the ones the cuts will get, in order.
    expect(cut.map((c) => c.id)).toEqual(cut.map((_, i) => doc.peekNoteId() + i));
  });

  it('makes the cuts that keep the sound when some would not', () => {
    const doc = stem();
    const sound = fingerprint(doc.data, samples);
    // 961 rounds to the tick of 960: a 0-frame slice, bumped to 0.5 ms - heard.
    const r = applyCuts(doc, planCuts(doc, 'stem.wav', [961, 1200], env), env);
    expect(r.ok).toBe(true);
    expect(ys(doc)).toEqual([0, 960, 1200]);
    expect(fingerprint(doc.data, samples)).toBe(sound);
    expect(applyCuts(doc, planCuts(doc, 'stem.wav', [1201], env), env).ok).toBe(false);
  });

  it('suggests cuts at onsets on the grid, strongest first, where not cut yet', () => {
    const doc = stem();
    const onsets = [
      { sec: 0.41, strength: 0.8 }, // 246 pulses: onto the beat at 240
      { sec: 0.6, strength: 0.9 }, // 360: halfway, off a quarter grid
      { sec: 0.38, strength: 0.3 }, // 228: 240 too, weaker
      { sec: 1.0, strength: 0.05 }, // too weak
      { sec: 1.6, strength: 1 }, // 960: already cut
      { sec: 13, strength: 1 }, // past the end
    ];
    const s = onsetSuggestions(doc, 'stem.wav', onsets, { step: 240 }, env);
    expect(s.map((x) => [x.y, x.sec])).toEqual([[240, 0.41]]);
    expect(s[0]!.ms).toBeCloseTo(410, 9);
    const exact = onsetSuggestions(doc, 'stem.wav', onsets, { step: 240, exact: true }, env);
    expect(exact.map((x) => x.y)).toEqual([230, 245, 360]);
    const ranged = onsetSuggestions(
      doc,
      'stem.wav',
      onsets,
      { step: 240, exact: true, from: 300, to: 1000 },
      env,
    );
    expect(ranged.map((x) => x.y)).toEqual([360]);
    const sound = fingerprint(doc.data, samples);
    expect(
      applyCuts(
        doc,
        exact.map((x) => x.cut),
        env,
        'Cut at onsets',
      ).ok,
    ).toBe(true);
    expect(ys(doc)).toEqual([0, 230, 245, 360, 960]);
    expect(fingerprint(doc.data, samples)).toBe(sound);
  });
});

// ---- model-based: any sequence of slicing keeps the sound ----------------------------

type Cmd =
  | { k: 'split'; y: number }
  | { k: 'heal'; pick: number }
  | { k: 'move'; pick: number; dy: number }
  | { k: 'key'; pick: number; x: number }
  | { k: 'chop'; from: number; span: number; step: number; silent: boolean }
  | { k: 'onsets'; secs: number[]; exact: boolean }
  | { k: 'undo' }
  | { k: 'redo' };

const LANES = [0, 1, 10, 11, 12, 13, 14, 15];
const yArb = fc.oneof(
  fc.integer({ min: 0, max: 64 }).map((k) => k * 60),
  fc.integer({ min: 0, max: 3840 }),
);
const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ k: fc.constant('split' as const), y: yArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('heal' as const), pick: fc.nat() }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('move' as const),
      pick: fc.nat(),
      dy: fc.constantFrom(-120, -60, -7, 7, 60, 120),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('key' as const),
      pick: fc.nat(),
      x: fc.constantFrom(...LANES),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('chop' as const),
      from: yArb,
      span: fc.integer({ min: 60, max: 1920 }),
      step: fc.constantFrom(60, 80, 120, 240),
      silent: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant('onsets' as const),
      secs: fc.array(fc.double({ min: 0, max: 7, noNaN: true }), { maxLength: 8 }),
      exact: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ k: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ k: 'redo' as const }) },
);

/** Random songs: the stem sliced and partly keyed (one name on two channels), a loop, hits; tempo and STOP. */
const songArb = fc.record({
  cuts: fc.array(fc.tuple(yArb, fc.constantFrom(0, 0, 11, 12)), { maxLength: 10 }),
  retrigger: fc.option(yArb),
  loops: fc.array(fc.tuple(yArb, fc.boolean()), { maxLength: 5 }),
  hits: fc.array(yArb, { maxLength: 6 }),
  vel: fc.constantFrom(undefined, 90),
  stop: fc.boolean(),
  bpm: fc.boolean(),
  lengths: fc.boolean(),
});
type Song = typeof songArb extends fc.Arbitrary<infer T> ? T : never;

function songDoc(s: Song) {
  const notes: N[] = [[1, 0, 0, false, s.vel]];
  const lane = new Set<string>();
  for (const [y, x] of s.cuts) {
    if (x && lane.has(`${x}:${y}`)) continue;
    lane.add(`${x}:${y}`);
    notes.push([1, y, x, true, s.vel]);
  }
  if (s.retrigger !== null) notes.push([4, s.retrigger, 0, false]);
  for (const [y, c] of s.loops) notes.push([2, y, 0, c]);
  for (const y of s.hits) notes.push([3, y, 0, false]);
  return makeDoc(notes, ['stem.wav', 'loop.wav', 'hit.wav', 'stem.wav'], {
    stopEvents: s.stop ? [{ y: 1100, duration: 180 }] : [],
    bpmEvents: s.bpm ? [{ y: 2000, bpm: 174 }] : [],
  });
}

describe('slicing (model-based)', () => {
  it('never changes the sound, refuses cleanly, and undoes losslessly', () => {
    let done = 0;
    let refused = 0;
    fc.assert(
      fc.property(songArb, fc.array(cmdArb, { minLength: 1, maxLength: 25 }), (song, cmds) => {
        const doc = songDoc(song);
        const e: SliceEnv = song.lengths ? { samples } : {};
        const sound = fingerprint(doc.data, e.samples);
        const initial = state(doc);
        const stemNotes = () =>
          doc.data.notes.filter((n) => n.ch === 1 || n.ch === 4).sort((a, b) => a.id - b.id);
        const pickOf = <T>(list: T[], i: number) =>
          list.length ? list[i % list.length] : undefined;
        for (const c of cmds) {
          const before = state(doc);
          let ok = true;
          switch (c.k) {
            case 'split':
              ok = sliceSplit(doc, 'stem.wav', c.y, e).ok;
              break;
            case 'heal': {
              const n = pickOf(
                stemNotes().filter((m) => m.c && m.x === BGM),
                c.pick,
              );
              if (n) ok = sliceHeal(doc, n.id, e).ok;
              break;
            }
            case 'move': {
              const n = pickOf(stemNotes(), c.pick);
              if (n) ok = sliceMove(doc, n.id, n.y + c.dy, e).ok;
              break;
            }
            case 'key': {
              const n = pickOf(stemNotes(), c.pick);
              if (n) ok = sliceKey(doc, [n.id], c.x, e).ok;
              break;
            }
            case 'chop': {
              const o = c.silent ? { isSilent: (a: number) => a % 2 < 0.5 } : {};
              const r = chopToGrid(doc, 'stem.wav', c.from, c.from + c.span, c.step, e, o);
              ok = r.ok;
              // Chopped once, chopping again changes nothing: what was not
              // cut the first time would not keep the sound.
              if (r.ok) {
                const after = state(doc);
                expect(chopToGrid(doc, 'stem.wav', c.from, c.from + c.span, c.step, e, o).ok).toBe(
                  false,
                );
                expect(state(doc)).toBe(after);
              }
              break;
            }
            case 'onsets': {
              const s = onsetSuggestions(
                doc,
                'stem.wav',
                c.secs.map((sec) => ({ sec, strength: 1 })),
                { step: 60, exact: c.exact },
                e,
              );
              if (s.length)
                ok = applyCuts(
                  doc,
                  s.map((x) => x.cut),
                  e,
                ).ok;
              break;
            }
            case 'undo':
              doc.undo();
              break;
            case 'redo':
              doc.redo();
              break;
          }
          if (ok && c.k !== 'undo' && c.k !== 'redo') done++;
          if (!ok) {
            refused++;
            expect(state(doc)).toBe(before);
          }
          expect(fingerprint(doc.data, e.samples)).toBe(sound);
          expect(doc.index.check(doc.data.notes)).toBeUndefined();
          for (const x of doc.index.laneKeys()) {
            if (x === BGM) continue;
            const l = doc.index.lane(x);
            for (let i = 1; i < l.length; i++) expect(l[i]!.y).not.toBe(l[i - 1]!.y);
          }
        }
        const final = state(doc);
        let undone = 0;
        while (doc.undo()) undone++;
        expect(state(doc)).toBe(initial);
        for (let i = 0; i < undone; i++) doc.redo();
        expect(state(doc)).toBe(final);
      }),
      { numRuns: 150 },
    );
    // The checks are not refusing everything.
    expect(done).toBeGreaterThan(refused);
  });
});

// ---- the real mixer agrees ------------------------------------------------------------

describe.skipIf(!RENDER)('chopped stems against the real mixer', () => {
  it('render as the uncut stem', () => {
    const SOUNDS = ['stem.wav', 'loop.wav', 'hit.wav'];
    const events = (chart: ChartData) => {
      const reg = new KeysoundRegistry();
      const plan = compileChart(chart, {
        columns: modeDef('7k').columns,
        name: 'render',
        keysounds: reg,
        samples,
      });
      return engineEvents(plan, reg, (src) => {
        const i = SOUNDS.indexOf(src);
        return i < 0 ? undefined : i;
      });
    };
    const pairs: [ChartData, ChartData][] = [];
    for (const song of fc.sample(songArb, { numRuns: 30, seed: 4 })) {
      const doc = songDoc({ ...song, lengths: true });
      const before = structuredClone(doc.data);
      for (const step of [60, 240]) chopToGrid(doc, 'stem.wav', 0, 3840, step, env);
      pairs.push([before, structuredClone(doc.data)]);
    }
    const jobs: RenderCase[] = [];
    for (const rate of [44100, 48000]) {
      const smp = SOUNDS.map((name, i) => ({
        frames: Math.round(LEN[name]! * rate),
        channels: 2 as const,
        seed: i + 1,
      }));
      for (const [a, b] of pairs) jobs.push({ rate, samples: smp, a: events(a), b: events(b) });
    }
    const reports = renderPairs(jobs);
    for (const [k, r] of reports.entries())
      expect(r.max_diff, `case ${k % pairs.length} at ${jobs[k]!.rate} Hz`).toBeLessThan(1e-5);
    // The chops did cut: most charts got new notes.
    expect(pairs.filter(([a, b]) => b.notes.length > a.notes.length + 10).length).toBeGreaterThan(
      20,
    );
  });
});
