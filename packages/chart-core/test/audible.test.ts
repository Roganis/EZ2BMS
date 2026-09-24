import { describe, expect, it } from 'vitest';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import { audible, audibleDiff, fingerprint } from '../src/publish/audible';
import type { SampleLookup } from '../src/publish/chart-plan';

// Notes as [channel, y, x, c, vel?]; 120 BPM, 240 pulses a beat: 1 beat = 500 ms.
type N = [ch: number, y: number, x: number, c: boolean, vel?: number];

function chart(names: string[], notes: N[], extra: Partial<ChartData> = {}): ChartData {
  const base = newChart({ mode: '7k', tier: 'NM', level: 1, bpm: 120 });
  return {
    ...base,
    ...extra,
    channels: names.map((name, i) => ({ id: i + 1, name })),
    notes: notes.map(([ch, y, x, c, vel], i): NoteRec => ({
      id: i + 1,
      ch,
      y,
      x,
      l: 0,
      c,
      ...(vel ? { vel } : {}),
    })),
  };
}

const same = (a: ChartData, b: ChartData, samples?: SampleLookup) =>
  audibleDiff(audible(a, { samples }), audible(b, { samples })) === undefined;

describe('audible', () => {
  it('does not care which lane a note is on', () => {
    const bgm = chart(
      ['pad.wav', 'kick.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true],
        [2, 240, 0, false],
      ],
    );
    const keyed = chart(
      ['pad.wav', 'kick.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 12, true],
        [2, 240, 11, false],
      ],
    );
    expect(same(bgm, keyed)).toBe(true);
    expect(fingerprint(bgm)).toBe(fingerprint(keyed));
  });

  it('merges a split inside a slice chain back into one stretch', () => {
    const chain = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true],
      ],
    );
    const split = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 240, 13, true],
        [1, 480, 0, true],
      ],
    );
    expect(same(chain, split)).toBe(true);
    const segs = audible(split).get('pad.wav')!;
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ fromMs: 0, toMs: null, fromF: 0, toF: null });
  });

  it('treats a whole hit cut by its own restart as the slices that replace it', () => {
    // A whole sample at 0 is cut when the same sample restarts at 480; a split
    // at 240 makes it two slices ending at the same place.
    const cut = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, false],
      ],
    );
    const split = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 240, 11, true],
        [1, 480, 0, false],
      ],
    );
    expect(same(cut, split)).toBe(true);
  });

  it('refuses a split that would cut a sound ringing past a new slice chain', () => {
    // pad@0 is whole and rings on: pad@480 starts a chain (another keysound, no cut).
    const ringing = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, false],
        [1, 720, 0, true],
      ],
    );
    const split = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 240, 11, true],
        [1, 480, 0, false],
        [1, 720, 0, true],
      ],
    );
    expect(audibleDiff(audible(ringing), audible(split))).toEqual({ src: 'pad.wav', atMs: 0 });
    // ...unless the sample has ended by then (400 ms long, the cut would be at 1000 ms).
    const short: SampleLookup = () => ({ frames: 0.4 * 44100 });
    expect(same(ringing, split, short)).toBe(true);
  });

  it('lets a channel naming the same file cut the sound, like one channel would', () => {
    const one = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, false],
      ],
    );
    const two = chart(
      ['pad.wav', 'pad.wav'],
      [
        [1, 0, 0, false],
        [2, 480, 0, false],
      ],
    );
    expect(same(one, two)).toBe(true);
    // A different spelling is a different source: no cut.
    const other = chart(
      ['pad.wav', 'PAD.wav'],
      [
        [1, 0, 0, false],
        [2, 480, 0, false],
      ],
    );
    expect(fingerprint(other)).not.toBe(fingerprint(one));
  });

  it('never merges the 0.5 ms minimum slice (it overlaps the next sound)', () => {
    // A continuation at the same instant as its fresh hit: the fresh hit becomes a
    // 22-frame slice that still plays under the continuation.
    const doubled = chart(
      ['hat.wav'],
      [
        [1, 0, 0, false],
        [1, 0, 11, true],
      ],
    );
    const single = chart(['hat.wav'], [[1, 0, 0, false]]);
    expect(same(doubled, single)).toBe(false);
  });

  it('keeps a chain equal across a STOP', () => {
    const stops = { stopEvents: [{ y: 300, duration: 240 }] };
    const chain = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true],
      ],
      stops,
    );
    const split = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 360, 14, true],
        [1, 480, 0, true],
      ],
      stops,
    );
    expect(same(chain, split)).toBe(true);
  });

  it('refuses a split that rounds onto the next note’s tick', () => {
    // 240 pulses a beat are 48 ticks: y 478 rounds to the same tick as 480.
    const chain = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true],
      ],
    );
    const split = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 478, 11, true],
        [1, 480, 0, true],
      ],
    );
    expect(same(chain, split)).toBe(false);
  });

  it('follows plan order at one instant: the later note on a voice wins', () => {
    // Two hits of hat at one tick: the one further right in lane order sounds.
    const a = chart(
      ['hat.wav'],
      [
        [1, 0, 0, false, 100],
        [1, 0, 11, false],
      ],
    );
    const b = chart(
      ['hat.wav'],
      [
        [1, 0, 12, false, 100],
        [1, 0, 11, false],
      ],
    );
    expect(audible(a).get('hat.wav')).toHaveLength(1);
    expect(same(a, b)).toBe(false);
    // With equal velocities it makes no difference.
    const c = chart(
      ['hat.wav'],
      [
        [1, 0, 0, false],
        [1, 0, 11, false],
      ],
    );
    const d = chart(
      ['hat.wav'],
      [
        [1, 0, 12, false],
        [1, 0, 11, false],
      ],
    );
    expect(same(c, d)).toBe(true);
  });

  it('hears a change of velocity and a moved hit, not a moved continuation', () => {
    const a = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true],
      ],
    );
    const louder = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 0, true, 100],
      ],
    );
    expect(audibleDiff(audible(a), audible(louder))).toEqual({ src: 'pad.wav', atMs: 0 });
    const hitLater = chart(
      ['pad.wav'],
      [
        [1, 120, 0, false],
        [1, 480, 0, true],
      ],
    );
    expect(same(a, hitLater)).toBe(false);
    // Where a continuation sits inside its own chain does not matter: the
    // sample plays on either way.
    const contLater = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 600, 0, true],
      ],
    );
    expect(same(a, contLater)).toBe(true);
  });

  it('drops what plays after the sample has ended', () => {
    const short: SampleLookup = () => ({ frames: 0.2 * 44100 });
    const a = chart(['pad.wav'], [[1, 0, 0, false]]);
    const b = chart(
      ['pad.wav'],
      [
        [1, 0, 0, false],
        [1, 480, 11, true],
      ],
    );
    expect(same(a, b, short)).toBe(true);
    expect(same(a, b)).toBe(true);
  });

  it('looks only at the sources asked for, and at notes given in place of the chart’s', () => {
    const c = chart(
      ['pad.wav', 'kick.wav'],
      [
        [1, 0, 0, false],
        [2, 0, 0, false],
      ],
    );
    expect([...audible(c, { srcs: new Set(['kick.wav']) }).keys()]).toEqual(['kick.wav']);
    const moved = audible(c, {
      notesOf: (ch) => (ch === 2 ? [{ id: 9, ch: 2, y: 240, x: 0, l: 0, c: false }] : []),
    });
    expect(moved.get('kick.wav')![0]!.fromMs).toBe(500);
    expect(moved.get('pad.wav')).toEqual([]);
  });
});
