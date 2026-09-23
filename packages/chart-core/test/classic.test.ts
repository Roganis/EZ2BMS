import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  classicCandidates,
  classicHeal,
  classicKey,
  classicMove,
  classicSplit,
  classicUnkey,
  resetAllToBgm,
  snapToSample,
  splitCandidates,
  type ClassicEnv,
} from '../src/edit/classic';
import { renameChannel } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import { fingerprint } from '../src/publish/audible';
import type { SampleLookup } from '../src/publish/chart-plan';

// 150 BPM, 240 pulses a beat: a beat is 400 ms.
const LEN: Record<string, number> = {
  'stem.wav': 12,
  'pad_1.wav': 1.2,
  'pad_2.wav': 1.2,
  'hit.wav': 0.2,
};
const samples: SampleLookup = (src) =>
  LEN[src] === undefined ? undefined : { frames: Math.round(LEN[src]! * 44100) };

type N = [ch: number, y: number, x: number, c: boolean, vel?: number];

function makeDoc(
  notes: N[],
  names = ['stem.wav', 'pad_1.wav', 'pad_2.wav', 'hit.wav'],
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

/** A stem sliced every beat, a pad hit twice, a hit on every other beat - all in the background. */
function stemSong() {
  const notes: N[] = [[1, 0, 0, false]];
  for (let b = 1; b < 16; b++) notes.push([1, b * 240, 0, true]);
  notes.push([2, 0, 0, false], [3, 960, 0, false]);
  for (let b = 0; b < 16; b += 2) notes.push([4, b * 240 + 120, 0, false]);
  return makeDoc(notes);
}

const state = (doc: ChartDoc) =>
  JSON.stringify({
    text: serializeBmson(doc.data),
    notes: [...doc.data.notes].sort((a, b) => a.id - b.id),
  });

describe('Classic keying', () => {
  it('keys a stem mid-slice with a continuation that sounds the same', () => {
    const doc = stemSong();
    const env: ClassicEnv = { samples, brush: 1 };
    const before = fingerprint(doc.data, samples);
    const cands = classicCandidates(doc, 11, 360, 0, env);
    expect(cands[0]).toMatchObject({ kind: 'split', ch: 1, tier: 4 });
    const r = classicKey(doc, 11, 360, 0, cands[0]!, env);
    expect(r.ok).toBe(true);
    const n = doc.index.get(r.id!)!;
    expect(n).toMatchObject({ ch: 1, x: 11, y: 360, c: true });
    expect(fingerprint(doc.data, samples)).toBe(before);
    expect([...doc.selection.ids]).toEqual([r.id]);
  });

  it('moves a note already at the spot, background first, keeping its continuation flag', () => {
    const doc = stemSong();
    const env: ClassicEnv = { samples };
    const cands = classicCandidates(doc, 12, 480, 0, env);
    expect(cands[0]).toMatchObject({ kind: 'note', ch: 1 });
    const r = classicKey(doc, 12, 480, 0, cands[0]!, env);
    expect(r.ok).toBe(true);
    expect(doc.index.get(r.id!)).toMatchObject({ x: 12, y: 480, c: true });
    expect(doc.data.notes).toHaveLength(stemSong().data.notes.length);
  });

  it('prefers the brush, then its group, then anything - latest onset first', () => {
    const doc = stemSong();
    // At beat 4.5 the stem, pad_1 (from 0, 1.2 s) and pad_2 (from beat 4) sound.
    const y = 4 * 240 + 60;
    const byGroup = classicCandidates(doc, 13, y, 0, { samples, brush: 2 });
    expect(byGroup.map((c) => c.ch)).toEqual([3, 1]);
    // pad_1 ended at 1.2 s (beat 3); the group's other member comes right after the brush.
    const noBrush = classicCandidates(doc, 13, y, 0, { samples });
    expect(noBrush.map((c) => c.ch)).toEqual([3, 1]);
    const stemFirst = classicCandidates(doc, 13, y, 0, { samples, brush: 1 });
    expect(stemFirst[0]!.ch).toBe(1);
  });

  it('offers nothing where nothing sounds, and never guesses a length it does not know', () => {
    const doc = makeDoc([[4, 0, 0, false]]);
    expect(classicCandidates(doc, 11, 600, 0, { samples })).toEqual([]);
    // Without a length the hit might still ring - but it is not offered.
    expect(classicCandidates(doc, 11, 20, 0, {})).toEqual([]);
    expect(classicCandidates(doc, 11, 20, 0, { samples })).toHaveLength(1);
  });

  it('marks a candidate that would cut a ringing sound, and refuses to key it', () => {
    // pad_1 fresh at 0 rings on (whole); pad_1 fresh at 480 starts a chain.
    const doc = makeDoc([
      [2, 0, 0, false],
      [2, 480, 0, false],
      [2, 720, 0, true],
    ]);
    const long: SampleLookup = () => ({ frames: 10 * 44100 });
    const [c] = classicCandidates(doc, 11, 240, 0, { samples: long });
    expect(c).toMatchObject({ kind: 'split', ch: 2 });
    expect(c!.bad).toMatch(/pad_1.wav/);
    const before = state(doc);
    const r = classicKey(doc, 11, 240, 0, c!, { samples: long });
    expect(r.ok).toBe(false);
    expect(state(doc)).toBe(before);
  });

  it('copies the sounding note’s velocity and pan into the split', () => {
    const doc = makeDoc([
      [1, 0, 0, false, 90],
      [1, 480, 0, true, 90],
    ]);
    const [c] = classicCandidates(doc, 11, 240, 0, { samples });
    const r = classicKey(doc, 11, 240, 0, c!, { samples });
    expect(r.ok).toBe(true);
    expect(doc.index.get(r.id!)!.vel).toBe(90);
  });
});

describe('Classic un-keying, splitting, healing', () => {
  it('sends a keyed note back, and heals only splits Classic made', () => {
    const doc = stemSong();
    const env = { samples, brush: 1 };
    const before = fingerprint(doc.data, samples);
    const [c] = classicCandidates(doc, 11, 360, 0, env);
    const { id } = classicKey(doc, 11, 360, 0, c!, env);
    const count = doc.data.notes.length;
    // Not ours to heal: it goes to the background.
    expect(classicUnkey(doc, [id!], env).ok).toBe(true);
    expect(doc.index.get(id!)).toMatchObject({ x: 0, l: 0, c: true });
    expect(doc.data.notes).toHaveLength(count);
    doc.undo();
    // Ours: healed away.
    const r = classicUnkey(doc, [id!], { ...env, healable: new Set([id!]) });
    expect(r).toMatchObject({ ok: true, healed: [id] });
    expect(doc.index.has(id!)).toBe(false);
    expect(fingerprint(doc.data, samples)).toBe(before);
  });

  it('keeps a note’s other fields when un-keying', () => {
    const doc = makeDoc([[4, 0, 11, false]]);
    doc.transact('x', (tx) =>
      tx.patchNotes([{ id: 1, patch: { vel: 80, pan: 20, kind: 3, up: true, xStop: 10 } }]),
    );
    expect(classicUnkey(doc, [1], { samples }).ok).toBe(true);
    expect(doc.index.get(1)).toMatchObject({
      x: 0,
      vel: 80,
      pan: 20,
      kind: 3,
      up: true,
      xStop: 10,
    });
  });

  it('never removes where a sound starts', () => {
    const doc = stemSong();
    const r = classicUnkey(doc, [1], { samples });
    expect(r.ok).toBe(false);
    expect(doc.index.has(1)).toBe(true);
  });

  it('splits in the background and heals the split again', () => {
    const doc = stemSong();
    const env = { samples };
    const before = fingerprint(doc.data, samples);
    const [c] = splitCandidates(doc, 300, env).filter((k) => k.ch === 1);
    const s = classicSplit(doc, 300, c!, env);
    expect(s.ok).toBe(true);
    expect(doc.index.get(s.id!)).toMatchObject({ x: 0, y: 300, c: true, ch: 1 });
    expect(fingerprint(doc.data, samples)).toBe(before);
    expect(classicHeal(doc, s.id!, env).ok).toBe(true);
    expect(doc.index.has(s.id!)).toBe(false);
    expect(fingerprint(doc.data, samples)).toBe(before);
  });

  it('resets every lane note to the background at once', () => {
    const doc = stemSong();
    const env = { samples, brush: 1 };
    const before = fingerprint(doc.data, samples);
    for (const [x, y] of [
      [11, 360],
      [12, 600],
      [13, 840],
    ] as const) {
      const [c] = classicCandidates(doc, x, y, 0, env);
      expect(classicKey(doc, x, y, 0, c!, env).ok).toBe(true);
    }
    const r = resetAllToBgm(doc, env);
    expect(r).toMatchObject({ ok: true, count: 3 });
    expect(doc.index.laneKeys()).toEqual([0]);
    expect(fingerprint(doc.data, samples)).toBe(before);
  });

  it('moves keyed notes across lanes, never in time', () => {
    const doc = stemSong();
    const env = { samples, brush: 1 };
    const [c] = classicCandidates(doc, 11, 360, 0, env);
    const { id } = classicKey(doc, 11, 360, 0, c!, env);
    expect(classicMove(doc, [{ id: id!, x: 15 }], env).ok).toBe(true);
    expect(doc.index.get(id!)).toMatchObject({ x: 15, y: 360 });
  });

  it('snaps to the nearest note of a group', () => {
    const doc = stemSong();
    expect(snapToSample(doc, 250, 30, 'stem')).toBe(240);
    expect(snapToSample(doc, 300, 30, 'stem')).toBeUndefined();
    expect(snapToSample(doc, 1000, 60, 'pad')).toBe(960);
  });
});

describe('renaming sound files', () => {
  it('renames channels and history so undo cannot bring the old name back', () => {
    const doc = stemSong();
    renameChannel(doc, 4, 'snap.wav');
    doc.markSaved();
    expect(doc.renameSoundRefs(new Map([['snap.wav', 'drums/snap.wav']]))).toBe(true);
    expect(doc.channel(4)!.name).toBe('drums/snap.wav');
    expect(doc.dirty).toBe(true);
    doc.undo();
    expect(doc.channel(4)!.name).toBe('hit.wav');
    doc.redo();
    expect(doc.channel(4)!.name).toBe('drums/snap.wav');
    expect(doc.renameSoundRefs(new Map([['nothing.wav', 'x.wav']]))).toBe(false);
  });
});

// ---- model-based: any sequence of Classic operations keeps the sound -----------------

type Cmd =
  | { k: 'key'; x: number; y: number; l: number; pick: number }
  | { k: 'unkey'; pick: number; heal: boolean }
  | { k: 'move'; pick: number; x: number }
  | { k: 'split'; y: number; pick: number }
  | { k: 'heal'; pick: number }
  | { k: 'reset' }
  | { k: 'undo' }
  | { k: 'redo' };

const LANES = [1, 10, 11, 12, 13, 14, 15, 31, 32];
const yArb = fc.oneof(
  fc.integer({ min: 0, max: 64 }).map((k) => k * 60),
  fc.integer({ min: 0, max: 3840 }),
);
const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      k: fc.constant('key' as const),
      x: fc.constantFrom(...LANES),
      y: yArb,
      l: fc.constantFrom(0, 0, 120),
      pick: fc.nat(3),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ k: fc.constant('unkey' as const), pick: fc.nat(), heal: fc.boolean() }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant('move' as const),
      pick: fc.nat(),
      x: fc.constantFrom(...LANES),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ k: fc.constant('split' as const), y: yArb, pick: fc.nat(3) }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('heal' as const), pick: fc.nat() }) },
  { weight: 1, arbitrary: fc.constant({ k: 'reset' as const }) },
  { weight: 1, arbitrary: fc.constant({ k: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ k: 'redo' as const }) },
);

/** Random songs: a sliced stem, two pads (one name twice), hits; BPM change, STOP, off-grid spots. */
const songArb = fc.record({
  cuts: fc.array(yArb, { maxLength: 12 }),
  pads: fc.array(fc.tuple(yArb, fc.constantFrom(2, 3, 5), fc.boolean()), { maxLength: 6 }),
  hits: fc.array(yArb, { maxLength: 10 }),
  vel: fc.constantFrom(undefined, 90),
  stop: fc.boolean(),
  bpm: fc.boolean(),
  lengths: fc.boolean(),
});

type Song = typeof songArb extends fc.Arbitrary<infer T> ? T : never;

function songDoc(s: Song) {
  const notes: N[] = [[1, 0, 0, false]];
  for (const y of s.cuts) notes.push([1, y, 0, true, s.vel]);
  for (const [y, ch, c] of s.pads) notes.push([ch, y, 0, c]);
  for (const y of s.hits) notes.push([4, y, 0, false]);
  return makeDoc(notes, ['stem.wav', 'pad_1.wav', 'pad_2.wav', 'hit.wav', 'pad_1.wav'], {
    stopEvents: s.stop ? [{ y: 1100, duration: 180 }] : [],
    bpmEvents: s.bpm ? [{ y: 2000, bpm: 174 }] : [],
  });
}

describe('Classic operations (model-based)', () => {
  it('never change the sound, refuse cleanly, and undo/redo losslessly', () => {
    let keyed = 0;
    let refused = 0;
    fc.assert(
      fc.property(songArb, fc.array(cmdArb, { minLength: 1, maxLength: 30 }), (song, cmds) => {
        const doc = songDoc(song);
        const env: ClassicEnv = song.lengths ? { samples, brush: 1 } : { brush: 1 };
        const sound = fingerprint(doc.data, env.samples);
        const initial = state(doc);
        const made = new Set<number>();
        const laneNotes = () => doc.data.notes.filter((n) => n.x !== 0).sort((a, b) => a.id - b.id);
        const pickOf = <T>(list: T[], i: number) =>
          list.length ? list[i % list.length] : undefined;
        for (const c of cmds) {
          const before = state(doc);
          let ok = true;
          switch (c.k) {
            case 'key': {
              const cand = pickOf(classicCandidates(doc, c.x, c.y, c.l, env), c.pick);
              if (!cand) break;
              const r = classicKey(doc, c.x, c.y, c.l, cand, env);
              ok = r.ok;
              if (r.ok) {
                keyed++;
                if (cand.kind === 'split') made.add(r.id!);
              } else refused++;
              break;
            }
            case 'unkey': {
              const n = pickOf(laneNotes(), c.pick);
              if (n) ok = classicUnkey(doc, [n.id], c.heal ? { ...env, healable: made } : env).ok;
              break;
            }
            case 'move': {
              const n = pickOf(laneNotes(), c.pick);
              if (n) ok = classicMove(doc, [{ id: n.id, x: c.x }], env).ok;
              break;
            }
            case 'split': {
              const cand = pickOf(splitCandidates(doc, c.y, env), c.pick);
              if (cand) ok = classicSplit(doc, c.y, cand, env).ok;
              break;
            }
            case 'heal': {
              const splits = doc.data.notes
                .filter((n) => n.x === 0 && n.c)
                .sort((a, b) => a.id - b.id);
              const n = pickOf(splits, c.pick);
              if (n) ok = classicHeal(doc, n.id, env).ok;
              break;
            }
            case 'reset':
              ok = resetAllToBgm(doc, env).ok;
              break;
            case 'undo':
              doc.undo();
              break;
            case 'redo':
              doc.redo();
              break;
          }
          if (!ok) expect(state(doc)).toBe(before);
          expect(fingerprint(doc.data, env.samples)).toBe(sound);
          expect(doc.index.check(doc.data.notes)).toBeUndefined();
          for (const x of doc.index.laneKeys()) {
            if (x === 0) continue;
            const lane = doc.index.lane(x);
            for (let i = 1; i < lane.length; i++) expect(lane[i]!.y).not.toBe(lane[i - 1]!.y);
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
    // Keying mostly works: the checks are not refusing everything.
    expect(keyed).toBeGreaterThan(refused);
  });
});
