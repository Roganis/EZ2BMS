import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildGroups, groupKeyOf } from '../src/sound/grouping';
import { resolveSound, SoundIndex } from '../src/sound/resolve';
import { soundUsage } from '../src/sound/usage';
import { newChart } from '../src/model/defaults';

type N = { id: number; y: number; l: number };
const chans = (names: string[]) => names.map((name, i) => ({ id: i + 1, name }));
const notesBy = (per: [number, number][][]) => {
  let id = 0;
  const m = new Map<number, N[]>();
  per.forEach((list, i) =>
    m.set(
      i + 1,
      list.map(([y, l]) => ({ id: ++id, y, l })),
    ),
  );
  return (ch: number) => m.get(ch) ?? [];
};

describe('groupKeyOf (BmsTWO SampleGrouping::GroupKeyOf)', () => {
  it("matches BmsTWO's own test vectors", () => {
    // tools/fuzz_history.cpp, "sample grouping" case.
    expect(groupKeyOf('piano_03.wav')).toBe('piano');
    expect(groupKeyOf('key_0348')).toBe('key');
    expect(groupKeyOf('BASS2')).toBe('BASS');
    expect(groupKeyOf('kick.ogg')).toBe('kick');
  });

  it('strips one trailing number and its separators, nothing else', () => {
    expect(groupKeyOf('piano 03.wav')).toBe('piano');
    expect(groupKeyOf('piano-03-2.wav')).toBe('piano-03');
    expect(groupKeyOf('a1b2')).toBe('a1b');
    expect(groupKeyOf('Piano_01')).not.toBe(groupKeyOf('piano_02'));
  });

  it('keeps an all-digit name whole: each numbered sound is its own group', () => {
    expect(groupKeyOf('0348.wav')).toBe('0348');
    expect(groupKeyOf('123.ogg')).toBe('123');
  });

  it('keeps the folder and only cuts the file name’s extension', () => {
    expect(groupKeyOf('drums/hit_01.wav')).toBe('drums/hit');
    expect(groupKeyOf('fx.v2/hit_01')).toBe('fx.v2/hit');
    expect(groupKeyOf('.hidden')).toBe('.hidden');
  });
});

describe('buildGroups (BmsTWO SampleGrouping::BuildGroups)', () => {
  it('packs non-overlapping notes of a group into one sub-lane', () => {
    const g = buildGroups(
      chans(['piano_01.wav', 'piano_02.wav', 'drum.wav']),
      notesBy([
        [
          [0, 0],
          [480, 0],
        ],
        [
          [240, 0],
          [720, 0],
        ],
        [[0, 0]],
      ]),
    );
    expect(g.map((x) => x.key)).toEqual(['drum', 'piano']);
    expect(g[1]!.subLanes).toBe(1);
    expect(g[1]!.placements).toHaveLength(4);
    expect(g[1]!.channels).toEqual([1, 2]);
  });

  it('opens a sub-lane for sounds at the same instant, and under a long note', () => {
    const same = buildGroups(chans(['piano_01', 'piano_02']), notesBy([[[0, 0]], [[0, 0]]]));
    expect(same[0]!.subLanes).toBe(2);
    expect(same[0]!.placements[0]!.sub).not.toBe(same[0]!.placements[1]!.sub);
    const long = buildGroups(chans(['pad_1', 'pad_2']), notesBy([[[0, 500]], [[100, 0]]]));
    expect(long[0]!.subLanes).toBe(2);
  });

  it('orders groups by UTF-16 code units, not naturally', () => {
    const g = buildGroups(chans(['piano', 'drum', 'BASS']), () => []);
    expect(g.map((x) => x.key)).toEqual(['BASS', 'drum', 'piano']);
  });

  it('keeps empty groups unless asked not to, and widens short notes by minExtent', () => {
    expect(buildGroups(chans(['a', 'b']), () => [])).toHaveLength(2);
    expect(buildGroups(chans(['a', 'b']), () => [], { keepEmpty: false })).toHaveLength(0);
    const near = notesBy([[[0, 0]], [[10, 0]]]);
    expect(buildGroups(chans(['p_1', 'p_2']), near)[0]!.subLanes).toBe(1);
    expect(buildGroups(chans(['p_1', 'p_2']), near, { minExtent: 60 })[0]!.subLanes).toBe(2);
  });

  it('never overlaps two notes in a sub-lane, with as few sub-lanes as the busiest moment needs', () => {
    const note = fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 80 }));
    fc.assert(
      fc.property(
        fc.array(fc.array(note, { maxLength: 12 }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 30 }),
        (per, minExtent) => {
          const names = per.map((_, i) => `s_${i}`);
          const [g] = buildGroups(chans(names), notesBy(per), { minExtent });
          const ps = g!.placements;
          const end = (p: { y: number; l: number }) => p.y + Math.max(p.l, minExtent);
          for (const a of ps)
            for (const b of ps)
              if (a !== b && a.sub === b.sub) expect(a.y < end(b) && b.y < end(a)).toBe(false);
          // The deepest overlap at any note's start is a lower bound, and first fit meets it.
          const depth = Math.max(
            1,
            ...ps.map((p) => ps.filter((q) => q.y <= p.y && end(q) > p.y).length),
          );
          expect(g!.subLanes).toBe(depth);
        },
      ),
    );
  });
});

describe('sound name resolution', () => {
  const files = ['Kick.wav', 'snare.ogg', 'stems/pad.flac', 'readme.txt', 'hat.ogg', 'hat.wav'];

  it('matches any case, then a same-stem audio file', () => {
    expect(resolveSound(files, 'kick.WAV')).toBe('Kick.wav');
    expect(resolveSound(files, 'snare.wav')).toBe('snare.ogg');
    expect(resolveSound(files, 'stems/PAD.wav')).toBe('stems/pad.flac');
    expect(resolveSound(files, 'hat.mp3')).toBe('hat.ogg');
    expect(resolveSound(files, 'readme.wav')).toBeUndefined();
    expect(resolveSound(files, 'nothing.wav')).toBeUndefined();
  });

  it('gives the same answers from an index', () => {
    const idx = new SoundIndex(files);
    for (const n of ['kick.WAV', 'snare.wav', 'stems/PAD.wav', 'hat.mp3', 'readme.wav', 'x.wav'])
      expect(idx.resolve(n)).toBe(resolveSound(files, n));
  });
});

describe('soundUsage', () => {
  const chart = (channels: string[], notes: [number, number][]) => ({
    ...newChart({ mode: '5k', tier: 'NM', level: 1 }),
    channels: channels.map((name, i) => ({ id: i + 1, name })),
    notes: notes.map(([ch, x], i) => ({ id: i + 1, ch, x, y: i * 60, l: 0, c: false })),
  });

  it('counts per file across charts, lane and background apart', () => {
    const folder = ['kick.ogg', 'snare.wav', 'pad.wav', 'cover.png'];
    const u = soundUsage(
      [
        {
          file: 'a.bmson',
          data: chart(
            ['kick.wav', 'snare.wav', 'gone.wav'],
            [
              [1, 11],
              [1, 0],
              [2, 12],
              [3, 0],
            ],
          ),
        },
        { file: 'b.bmson', data: chart(['KICK.ogg', 'snare.wav'], [[1, 0]]) },
      ],
      folder,
    );
    expect(u.sounds.map((s) => s.name)).toEqual(['kick.ogg', 'snare.wav', 'pad.wav', 'gone.wav']);
    const kick = u.byKey.get('kick.ogg')!;
    expect(kick.notes).toBe(3);
    expect(kick.charts).toEqual([
      { chart: 'a.bmson', channels: [1], lane: 1, bgm: 1 },
      { chart: 'b.bmson', channels: [1], lane: 0, bgm: 1 },
    ]);
    expect(u.unusedFiles).toEqual(['pad.wav']);
    expect(u.missing).toEqual(['gone.wav']);
    expect(u.unusedChannels).toEqual([{ chart: 'b.bmson', ch: 2, name: 'snare.wav' }]);
    expect(u.byKey.get('snare.wav')!.group).toBe('snare');
  });

  it('files two channels naming one sound under one row', () => {
    const u = soundUsage(
      [
        {
          file: 'a.bmson',
          data: chart(
            ['hat.wav', 'Hat.WAV'],
            [
              [1, 0],
              [2, 0],
            ],
          ),
        },
      ],
      ['hat.wav'],
    );
    expect(u.sounds).toHaveLength(1);
    expect(u.sounds[0]!.charts[0]).toEqual({ chart: 'a.bmson', channels: [1, 2], lane: 0, bgm: 2 });
  });
});
