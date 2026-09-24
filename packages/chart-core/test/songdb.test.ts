// song.bin (a mode's song table) and the song titles in EZ2PORT's text
// manifest. The table's reading, its cipher and its chart-file rules are
// checked against the port's own code (ez2/songdb.c) on made-up tables; the
// titles have no oracle (the port renders them, it does not return them).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { synthPe } from '../src/dev/synthgame';
import { exeRead } from '../src/ez2data/keytable';
import {
  parseSongdb,
  readSongdb,
  SONGDB_TABLE_SIZE,
  SONGDB_TABLE_VA,
  SongDbError,
  songdbCategoryView,
  songdbCharts,
  songdbCrypt,
  songdbGroupsOf,
  songdbSongDir,
  versionCategory,
  writeSongdb,
  type SongDb,
  type SongEntry,
} from '../src/ez2data/songdb';
import { parseSongTitles } from '../src/ez2data/songtext';
import { MODES, modeNames } from '../src/modes/ids';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const f = Math.fround;
const entry = (key: string, levels: number[], bpm = 150, name = ''): SongEntry => ({
  key,
  name,
  kind: 0,
  steps: [0, 1, 2, 3].map((t) => ({
    level: levels[t] ?? 0,
    a: 0,
    b: f(bpm),
  })) as SongEntry['steps'],
});

function table(): SongDb {
  const groups: string[][] = Array.from({ length: 47 }, () => []);
  groups[2] = ['anti', 'bluesy', 'gone']; // ALL
  groups[4] = ['BLUESY']; // S/E (a version bank), any case
  groups[9] = ['anti']; // PLT
  groups[20] = ['anti']; // LV1
  return {
    entries: [
      entry('anti', [3, 7, 11, 0], 174),
      entry('bluesy', [0, 5, 0, 0]),
      entry('92', [4], 120, '11ambit-5o1'),
    ],
    groups,
  };
}

const tables = () => Uint8Array.from({ length: SONGDB_TABLE_SIZE }, (_, i) => (i * 97 + 13) & 0xff);

describe('song.bin', () => {
  it('reads back what it wrote, groups and all', () => {
    const db = table();
    expect(parseSongdb(writeSongdb(db))).toEqual(db);
  });

  it('decrypts with the tables in the executable, and says when they are wrong', () => {
    const plain = writeSongdb(table());
    const enc = songdbCrypt(plain, tables());
    expect(songdbCrypt(enc, tables())).toEqual(plain); // its own inverse
    const exe = synthPe([{ va: SONGDB_TABLE_VA, bytes: tables() }]);
    expect(exeRead(exe, SONGDB_TABLE_VA, SONGDB_TABLE_SIZE)).toEqual(tables());
    expect(readSongdb(enc, exe)).toEqual(table());
    expect(readSongdb(plain)).toEqual(table()); // plaintext needs no executable
    const wrong = synthPe([{ va: SONGDB_TABLE_VA, bytes: tables().reverse() }]);
    expect(() => readSongdb(enc, wrong)).toThrow(SongDbError);
    expect(() => readSongdb(enc)).toThrow(/executable/);
  });

  it('lists categories as the select does, and files a song by its version', () => {
    const db = table();
    expect(songdbCategoryView(db, 2)).toEqual([0]); // bluesy's NM level is 0; gone is not an entry
    expect(songdbGroupsOf(db, 'Anti')).toEqual([3, 10, 21]);
    expect(versionCategory([db], 'anti')).toBe(10);
    expect(versionCategory([db], 'bluesy')).toBe(5);
    expect(versionCategory([db], '92')).toBe(48);
  });

  it('finds the charts a table offers, and the folder they are in', () => {
    const [anti, , cv2] = table().entries as [SongEntry, SongEntry, SongEntry];
    const files = [
      'StreetMix1p-ANTI.ez',
      'streetmix1p-anti-hd.EZ',
      'streetmix1p-anti-ex.ez',
      'x.ezi',
    ];
    // EX is on disk but the table's level is 0: not offered. SHD is offered but not on disk.
    expect(songdbCharts(anti, 'streetmix', files)).toEqual([
      { tier: 0, level: 3, file: 'StreetMix1p-ANTI.ez' },
      { tier: 1, level: 7, file: 'streetmix1p-anti-hd.EZ' },
    ]);
    expect(songdbCharts(cv2, 'streetmix', ['streetmix1p-11ambit-5o1.ez'])).toEqual([
      { tier: 0, level: 4, file: 'streetmix1p-11ambit-5o1.ez' },
    ]);
    expect(songdbSongDir(anti, ['Anti', 'other'])).toBe('Anti');
    expect(songdbSongDir(cv2, ['11AMBIT'])).toBe('11AMBIT');
  });
});

describe('song titles (the port manifest)', () => {
  it("reads each plate's title and subtitle", () => {
    const t = parseSongTitles(
      '\uFEFF; GENERATED\r\n[system/songname/10anti.abm]\r\nsize = 256,32\r\n' +
        'line = "AntiDOT" | 246,22,9 | bold | ffffff | right | 236\r\n' +
        '[SYSTEM\\SongName\\Stay.BMP]\nline = "Stay; \\"Remix\\"" | 246,15,7 | bold | ffffff | right ; a comment\n' +
        'line = "Sub | Title" | 246,27,6 | bold | c5c5c5 | right\n' +
        '[system/SongSelect/Sortimage/category_01.abm]\nline = cat.hot | 62,13,11 | light | ffffff | center\n' +
        '[system/songname/keyed.abm]\nline = song.keyed | 1,2,3 | bold | ffffff | right\n',
    );
    expect(t.get('10anti')).toEqual({ title: 'AntiDOT' });
    // The quotes are the outermost pair (a ';' between them is no comment);
    // a '|' splits fields, as the port does, and each field is trimmed.
    expect(t.get('stay')).toEqual({ title: 'Stay; \\"Remix\\"', subtitle: 'Sub' });
    expect(t.has('keyed')).toBe(false); // a strings key, not words
    expect(t.size).toBe(2);
  });
});

// ---- against the port's own reader ------------------------------------------------

const key = fc.stringMatching(/^[a-z0-9]{1,12}$/);
const dbArb = fc
  .tuple(
    fc.uniqueArray(key, { minLength: 0, maxLength: 12 }),
    fc.array(fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 4, maxLength: 4 }), {
      minLength: 12,
      maxLength: 12,
    }),
    fc.array(fc.tuple(fc.integer({ min: 0, max: 46 }), fc.integer({ min: 0, max: 11 })), {
      maxLength: 40,
    }),
    fc.array(fc.double({ min: 60, max: 400, noNaN: true }), { minLength: 12, maxLength: 12 }),
  )
  .map(([keys, levels, memberships, bpms]): SongDb => {
    const groups: string[][] = Array.from({ length: 47 }, () => []);
    for (const [g, k] of memberships)
      if (keys[k]) groups[g]!.push(k % 3 ? keys[k]!.toUpperCase() : keys[k]!);
    return {
      entries: keys.map((k, i) => ({
        key: k,
        name: i % 5 === 4 ? `${k}-5o1` : '',
        kind: i % 3,
        steps: levels[i]!.map((l) => ({ level: l, a: 0, b: f(bpms[i]!) })) as SongEntry['steps'],
      })),
      groups,
    };
  });

describe.skipIf(!ORACLE)('song.bin against EZ2PORT (oracle)', () => {
  it('parses every table as ez2_songdb_parse does, category views included', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(dbArb, fc.integer({ min: 0, max: 60 }), (db, cut) => {
          let bytes = writeSongdb(db);
          // Sometimes cut into the groups (tolerated) or the records (refused).
          if (cut < 10) bytes = bytes.subarray(0, Math.max(0, bytes.length - cut * 7));
          const path = write('song.bin', bytes);
          let theirs: unknown;
          try {
            theirs = oracle(['songdb', path]);
          } catch {
            theirs = 'error';
          }
          let ours: unknown;
          try {
            const p = parseSongdb(bytes);
            ours = {
              entries: p.entries,
              groups: p.groups,
              views: p.groups.map((_, g) => songdbCategoryView(p, g)),
            };
          } catch {
            ours = 'error';
          }
          if (theirs !== 'error') {
            const t = theirs as { entries: SongEntry[] };
            for (const e of t.entries)
              for (const s of e.steps) {
                s.a = f(s.a);
                s.b = f(s.b);
              }
          }
          expect(ours).toEqual(theirs);
        }),
        { numRuns: 60, seed: 5031 },
      );
    });
  });

  it('decrypts byte for byte as ez2_songdb_decrypt', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 700 }),
          fc.uint8Array({ minLength: 64, maxLength: 64 }),
          (bytes, t) => {
            const theirs = oracle<{ hex: string }>([
              'songdb-crypt',
              write('in.bin', bytes),
              write('t.bin', t),
            ]).hex;
            expect(Buffer.from(songdbCrypt(bytes, t)).toString('hex')).toBe(theirs);
          },
        ),
        { numRuns: 30, seed: 5032 },
      );
    });
  });

  it('finds the same chart files and folders as ez2_songdb_charts', () => {
    withTmpDir((dir) => {
      const db = table();
      db.entries.push(entry('Mixed', [1, 1, 1, 1]), entry('nodir', [2]));
      const root = join(dir, 'game');
      const song = (d: string, files: string[]) => {
        mkdirSync(join(root, 'sound', d), { recursive: true });
        for (const f of files) writeFileSync(join(root, 'sound', d, f), '');
      };
      song('ANTI', ['StreetMix1p-anti.ez', 'streetmix1p-ANTI-hd.ez', 'streetmix1p-anti-ex.ez']);
      song('Bluesy', ['streetmix1p-bluesy-hd.ez', 'catch1p-bluesy-hd.ez']);
      song('11ambit', ['StreetMix1p-11ambit-5o1.ez']);
      song('mixed', [
        'streetmix1p-mixed-shd.ez',
        'streetmix1p-mixed-ex.ez',
        'streetmix2p-mixed.ez',
      ]);
      const bin = join(dir, 'song.bin');
      writeFileSync(bin, writeSongdb(db));
      const sound = ['ANTI', 'Bluesy', '11ambit', 'mixed'];
      const listing: Record<string, string[]> = {
        ANTI: ['StreetMix1p-anti.ez', 'streetmix1p-ANTI-hd.ez', 'streetmix1p-anti-ex.ez'],
        Bluesy: ['streetmix1p-bluesy-hd.ez', 'catch1p-bluesy-hd.ez'],
        '11ambit': ['StreetMix1p-11ambit-5o1.ez'],
        mixed: ['streetmix1p-mixed-shd.ez', 'streetmix1p-mixed-ex.ez', 'streetmix2p-mixed.ez'],
      };
      for (const mode of ['5k', 'catch'] as const) {
        const port = modeNames(mode).portName;
        const theirs = oracle<{
          entries: {
            key: string;
            dir: string | null;
            charts: { tier: number; level: number; path: string }[];
          }[];
        }>(['songdb-charts', bin, root, port]).entries;
        const ours = db.entries.map((e) => {
          const d = songdbSongDir(e, sound);
          return {
            key: e.key,
            dir: d ? `sound/${d}` : null,
            charts: d
              ? songdbCharts(e, modeNames(mode).filePrefix, listing[d]!).map((c) => ({
                  tier: c.tier,
                  level: c.level,
                  path: `sound/${d}/${c.file}`,
                }))
              : [],
          };
        });
        expect(ours, port).toEqual(theirs);
      }
    });
  });
});

// ---- a real install (EZ2_ROOT + EZ2_EXE; skipped without them) -----------------------

const ROOT = process.env.EZ2_ROOT;
const EXE = process.env.EZ2_EXE;

describe.skipIf(!ROOT || !EXE || !existsSync(join(ROOT ?? '', 'system')) || !existsSync(EXE ?? ''))(
  'a real install (EZ2_ROOT, EZ2_EXE)',
  () => {
    it("every mode's song.bin decrypts, and every tier it offers has its chart", () => {
      const exe = new Uint8Array(readFileSync(EXE!));
      const sys = join(ROOT!, 'system');
      const sound = readdirSync(join(ROOT!, 'sound'));
      let tables = 0;
      let songs = 0;
      let missing = 0;
      for (const m of MODES) {
        const dir = readdirSync(sys).find((d) => d.toLowerCase() === m.portName.toLowerCase());
        const bin = dir && readdirSync(join(sys, dir)).find((f) => f.toLowerCase() === 'song.bin');
        if (!dir || !bin) continue;
        const db = readSongdb(new Uint8Array(readFileSync(join(sys, dir, bin))), exe);
        tables++;
        for (const e of db.entries) {
          const d = songdbSongDir(e, sound);
          if (!d) continue;
          songs++;
          const offered = e.steps.filter((s) => s.level > 0).length;
          const found = songdbCharts(e, m.filePrefix, readdirSync(join(ROOT!, 'sound', d))).length;
          missing += offered - found;
        }
      }
      console.log(
        `${tables} song tables, ${songs} songs, ${missing} offered tiers without a chart`,
      );
      expect(tables).toBeGreaterThan(0);
      // The port's sweep: a level above zero always has a file.
      expect(missing).toBe(0);
    });
  },
);
