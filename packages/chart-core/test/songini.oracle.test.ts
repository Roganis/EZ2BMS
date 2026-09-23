// song.ini as EZ2PORT reads it, rankings across publishes, and whose package
// a folder is. The reader is checked against the port's own merge
// (ez2_usersongs_merge through the oracle) on hand-made and random files.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { newChart } from '../src/model/defaults';
import { modeNames } from '../src/modes/ids';
import { compileSong } from '../src/publish/package';
import { keptRankings, packageOwner, rankedChartFiles, rankingFile } from '../src/publish/rankings';
import { atoi, readSongIni } from '../src/publish/songini-read';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

interface Listed {
  added: number;
  entries: {
    key: string;
    name: string;
    levels: number[];
    groups: number[];
    listed: number[];
    assets: Record<string, string | null>;
    bga: { file: string; start_ms: number } | null;
    rank: (string | null)[];
  }[];
}

/** Put song.ini files in a songs root and list it as the port does for `mode`. */
function listRoot(songs: Record<string, string | Uint8Array>, mode: string, shipped = ''): Listed {
  return withTmpDir((dir) => {
    for (const [folder, text] of Object.entries(songs)) {
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, 'song.ini'), text);
    }
    return oracle<Listed>(['usersongs', dir, mode, ...(shipped ? [shipped] : [])]);
  });
}

/** What readSongIni says the port lists for `mode`. */
function expected(text: string, mode: string) {
  const r = readSongIni(text);
  const levels = [0, 0, 0, 0];
  let any = false;
  for (const c of r.charts)
    if (c.mode.toLowerCase() === mode.toLowerCase()) {
      any = true;
      levels[['NM', 'HD', 'SHD', 'EX'].indexOf(c.tier)] = c.level;
    }
  return { r, levels, any };
}

describe('readSongIni', () => {
  it("follows the port's small print", () => {
    const r = readSongIni(
      [
        '; a comment',
        '[song]',
        'KEY = mysong',
        'Title = Rock; and roll',
        'Category = 07x',
        '# another',
        '[Charts]',
        'StreetMix.hd = 12 ; streetmix1p-mysong-hd.ez',
        'StreetMix.XX = 3',
        '7StreetMix.NM = 5',
        '[ASSETS]',
        'Disc = "disc.abm"',
        '[Bga]',
        'File = movie.mp4',
        'StartMs = -120',
        '[EZ2BMS]',
        'SongId = 0f0e',
      ].join('\r\n'),
    );
    expect(r.key).toBe('mysong');
    expect(r.title).toBe('Rock');
    expect(r.category).toBe(7);
    expect(r.charts).toEqual([
      { mode: 'StreetMix', tier: 'HD', level: 12 },
      { mode: '7StreetMix', tier: 'NM', level: 5 },
    ]);
    // Quotes are not stripped.
    expect(r.assets.disc).toBe('"disc.abm"');
    expect(r.bga).toEqual({ file: 'movie.mp4', startMs: -120 });
    expect(r.ez2bms).toEqual({ SongId: '0f0e' });
    // A BOM before [Song] hides the song from the port.
    expect(readSongIni(String.fromCharCode(0xfeff) + '[Song]\nKey = x\n').key).toBe('');
    expect(readSongIni('[Song]\nCategory = 49\n').category).toBe(48);
    expect(readSongIni('[Song]\nTitle = ' + 'a'.repeat(40)).title).toHaveLength(32);
  });

  it('reads numbers like atoi', () => {
    expect(atoi('  12abc')).toBe(12);
    expect(atoi('-3')).toBe(-3);
    expect(atoi('x1')).toBe(0);
    expect(atoi('+7')).toBe(7);
  });
});

describe.skipIf(!ORACLE)("readSongIni against the port's merge", () => {
  it('agrees on hand-made files', () => {
    const cases = [
      '[Song]\nKey = abc\nTitle = Hello; there\nCategory = 0\n[Charts]\nStreetMix.NM = 3\nStreetMix.HD = 9 ; x.ez\n[EZ2BMS]\nSongId = 1\n',
      '[Song]\r\nKey = abc\r\nTitle =   spaced   \r\nCategory=12\r\n[Charts]\r\nSTREETMIX.nm=7\r\nstreetmix.EX = 20\r\n',
      '[Song]\nKey = abc\nCategory = 47\n[Charts]\nStreetMix.HD = 4\n',
      '[Song]\nKey = abc\n[Charts]\nStreetMix.NM = 1\nStreetMix.NM = 5\n',
    ];
    for (const text of cases) {
      const got = listRoot({ abc: text }, 'StreetMix');
      const want = expected(text, 'StreetMix');
      expect(got.added).toBe(want.any ? 1 : 0);
      const e = got.entries[0]!;
      expect(e.name).toBe(want.r.title);
      expect(e.levels).toEqual(want.levels);
      expect(e.groups).toEqual([want.r.category]);
      expect(e.listed).toEqual(want.levels[0]! > 0 ? [want.r.category] : []);
    }
  });

  it('agrees on random files', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9 ;#=.\-_]{0,12}$/);
    const line = fc.oneof(
      fc.constantFrom('[Song]', '[Charts]', '[song]', '[CHARTS]', '[Other]', '; c', ''),
      fc
        .tuple(fc.constantFrom('Title', 'title', 'Category', 'Key'), word)
        .map(([k, v]) => `${k} = ${v}`),
      fc
        .tuple(
          fc.constantFrom('StreetMix', 'streetmix', '7StreetMix', 'Bogus'),
          fc.constantFrom('NM', 'HD', 'shd', 'EX', 'XX'),
          fc.integer({ min: -3, max: 30 }),
        )
        .map(([m, t, l]) => `${m}.${t} = ${l}`),
    );
    fc.assert(
      fc.property(fc.array(line, { maxLength: 14 }), (lines) => {
        const text = ['[Song]', 'Key = abc', ...lines].join('\n');
        const got = listRoot({ abc: text }, 'StreetMix');
        const want = expected(text, 'StreetMix');
        const r = want.r;
        if (!r.key || !want.any) return got.added === 0;
        const e = got.entries[0]!;
        return (
          e.key.toLowerCase() === r.key.toLowerCase() &&
          e.name === r.title &&
          JSON.stringify(e.levels) === JSON.stringify(want.levels) &&
          JSON.stringify(e.groups) === JSON.stringify([r.category])
        );
      }),
      { numRuns: 60 },
    );
  });

  it('lists a published package as intended, [EZ2BMS] and all', () => {
    const data = newChart({ mode: '5k', tier: 'NM', level: 4, title: 'Lanes' });
    const plan = compileSong(
      {
        key: 'lanes',
        title: 'Lanes; the song',
        artist: 'A',
        genre: 'G',
        category: 38,
        songnameAbm: new Uint8Array(10),
        songId: 'abcd-1234',
      },
      [{ data, mode: '5k', tier: 'NM' }],
    );
    const ini = new TextDecoder().decode(plan.files.find((f) => f.path === 'song.ini')!.bytes);
    expect(ini).toContain('[EZ2BMS]\nSongId = abcd-1234');
    const got = withTmpDir((dir) => {
      mkdirSync(join(dir, 'lanes'));
      for (const f of plan.files) writeFileSync(join(dir, 'lanes', f.path), f.bytes);
      return oracle<Listed>(['usersongs', dir, modeNames('5k').portName]);
    });
    expect(got.entries).toHaveLength(1);
    const e = got.entries[0]!;
    // The title's ';' is written as ',' so nothing is cut.
    expect(e.name).toBe('Lanes, the song');
    expect(e.levels).toEqual([4, 0, 0, 0]);
    expect(e.groups).toEqual([38]);
    expect(e.assets.Songname).toBe('lanes/songname.abm');
    expect(readSongIni(ini).ez2bms).toEqual({ SongId: 'abcd-1234' });
    // Ranking tables go beside the charts, named as rankingFile reads them.
    for (const [t, path] of e.rank.entries()) {
      const r = rankingFile(path!.split('/').pop()!, 'lanes');
      expect(r).toEqual({ mode: '5k', tier: ['NM', 'HD', 'SHD', 'EX'][t], alt: false });
    }
  });

  it('never lists a package over a shipped song', () => {
    const got = listRoot(
      { abc: '[Song]\nKey = abc\n[Charts]\nStreetMix.NM = 3\n' },
      'StreetMix',
      'ABC',
    );
    expect(got.added).toBe(0);
  });
});

describe('rankings across publishes', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('names the tables the way the port does', () => {
    expect(rankingFile('rank_StreetMix_abc.bin', 'abc')).toEqual({
      mode: '5k',
      tier: 'NM',
      alt: false,
    });
    expect(rankingFile('E_RANK_7StreetMix_ABC-shd.bin', 'abc')).toEqual({
      mode: '7k',
      tier: 'SHD',
      alt: true,
    });
    expect(rankingFile('rank_StreetMix_other.bin', 'abc')).toBeUndefined();
    expect(rankingFile('rank_Nope_abc.bin', 'abc')).toBeUndefined();
    expect(rankingFile('streetmix1p-abc.ez', 'abc')).toBeUndefined();
  });

  it("keeps a chart's tables only when its .ez and .ini are unchanged", () => {
    const old: Record<string, Uint8Array> = {
      'streetmix1p-abc.ez': bytes('ez nm'),
      'streetmix1p-abc.ini': bytes('ini nm'),
      'streetmix1p-abc-hd.ez': bytes('ez hd'),
      'streetmix1p-abc-hd.ini': bytes('ini hd'),
      'rank_StreetMix_abc.bin': bytes('scores'),
      'e_rank_StreetMix_abc.bin': bytes('scores'),
      'rank_StreetMix_abc-hd.bin': bytes('scores'),
      'rank_StreetMix_abc-ex.bin': bytes('scores'),
    };
    const files = [
      { path: 'streetmix1p-abc.ez', bytes: bytes('ez nm') },
      { path: 'streetmix1p-abc.ini', bytes: bytes('ini nm') },
      { path: 'streetmix1p-abc-hd.ez', bytes: bytes('ez hd') },
      // The HD windows changed: its scores mean something else now.
      { path: 'streetmix1p-abc-hd.ini', bytes: bytes('ini hd 2') },
    ];
    const names = Object.keys(old);
    expect(keptRankings({ key: 'abc', oldNames: names, old: (n) => old[n], files }).sort()).toEqual(
      ['e_rank_StreetMix_abc.bin', 'rank_StreetMix_abc.bin'],
    );
    expect(rankedChartFiles('abc', names).sort()).toEqual([
      'streetmix1p-abc-hd.ez',
      'streetmix1p-abc-hd.ini',
      'streetmix1p-abc.ez',
      'streetmix1p-abc.ini',
    ]);
  });

  it('tells whose package a folder is', () => {
    const owner = (songIni: string | undefined, exists = true) =>
      packageOwner({ exists, songIni }, 'me', readSongIni);
    expect(owner(undefined, false)).toBe('new');
    expect(owner(undefined)).toBe('foreign');
    expect(owner('[Song]\nKey = abc\n[EZ2BMS]\nSongId = me\n')).toBe('ours');
    expect(owner('[Song]\nKey = abc\n[EZ2BMS]\nSongId = you\n')).toBe('foreign');
    expect(owner('[Song]\nKey = abc\nConverter = EZ2BMS 0.1.0\n')).toBe('legacy');
    expect(owner('[Song]\nKey = abc\nConverter = bmson2ez\n')).toBe('foreign');
  });
});
