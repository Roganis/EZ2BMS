// Sending a song back to the game (publish/cabinet.ts, M6): song.bin patched
// in place, which files each chart becomes, keysound files that never write
// over one already there, and the encrypted bytes - read back by EZ2PORT's
// own decrypt, chart, .ezi, .ini and song.bin readers (the oracle).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { synthGame, SYNTH_EZ_TABLES, SYNTH_SONGDB_TABLES } from '../src/dev/synthgame';
import {
  parseSongdb,
  patchSongdb,
  SONGDB_RECORD,
  songdbCrypt,
  songdbRecordAt,
  writeSongdb,
  type SongDb,
  type SongEntry,
} from '../src/ez2data/songdb';
import { ez2Decrypt } from '../src/ez2data/crypt';
import { ezSongSource, memoryGameFs, openGame } from '../src/io/ez/game';
import { importEzSong } from '../src/io/ez/import';
import {
  cabinetTargets,
  finishCabinet,
  nameSounds,
  planCabinet,
  soundCandidates,
  sourceTarget,
  type CabinetChart,
} from '../src/publish/cabinet';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const f = Math.fround;

async function alpha() {
  const g = synthGame();
  const manifest = new TextDecoder().decode(g.files.get('text/manifest.songs.ini'));
  const game = await openGame(memoryGameFs(g.files), g.exe, manifest, { tables: SYNTH_EZ_TABLES });
  const imp = importEzSong(
    await ezSongSource(
      game,
      game.songs.find((s) => s.dir === 'alpha')!,
    ),
  );
  const targets = cabinetTargets(game);
  const target = sourceTarget(targets, imp.song.source)!;
  const files = await game.fs.list(`sound/${target.dir}`);
  const charts: CabinetChart[] = imp.charts.map((c) => ({
    file: c.file,
    data: c.data,
    mode: c.mode,
    tier: c.tier,
  }));
  return { g, game, imp, targets, target, files, charts };
}

// ---- song.bin ---------------------------------------------------------------------

const entry = (key: string, levels: number[], bpm = 150): SongEntry => ({
  key,
  name: '',
  kind: 0,
  steps: [0, 1, 2, 3].map((t) => ({
    level: levels[t] ?? 0,
    a: 0,
    b: f(bpm),
  })) as SongEntry['steps'],
});

/** A table on disk with what writeSongdb would not give back: header bytes 4-5, bytes after a key's NUL, a tail. */
function onDisk(db: SongDb, junk: number, tables?: Uint8Array): Uint8Array {
  const plain = writeSongdb(db);
  const out = new Uint8Array(plain.length + (junk % 7));
  out.set(plain);
  out[4] = junk & 0xff;
  out[5] = (junk * 7) & 0xff;
  for (let i = 0; i < db.entries.length; i++) {
    const r = 0x10 + i * SONGDB_RECORD;
    const nul = r + db.entries[i]!.key.length;
    for (let p = nul + 1; p < r + 16; p++) out[p] = (p * junk) & 0xff;
  }
  for (let p = plain.length; p < out.length; p++) out[p] = (p ^ junk) & 0xff;
  return tables ? songdbCrypt(out, tables) : out;
}

describe('song.bin, patched in place', () => {
  const tables = Uint8Array.from({ length: 64 }, (_, i) => (i * 97 + 13) & 0xff);
  const db = (): SongDb => ({
    entries: [entry('anti', [3, 7, 0, 0], 174), entry('Bluesy', [0, 5])],
    groups: Array.from({ length: 47 }, (_, g) => (g === 2 ? ['anti', 'bluesy'] : [])),
  });

  it('changes only the bytes of the values it is given', () => {
    const before = onDisk(db(), 91, tables);
    expect(patchSongdb(before, tables, [])).toEqual({ bytes: before, changed: [] });
    // The same values again change nothing.
    expect(
      patchSongdb(before, tables, [{ key: 'ANTI', tier: 1, level: 7, bpm: 174 }]).changed,
    ).toEqual([]);
    const r = patchSongdb(before, tables, [
      { key: 'bluesy', tier: 2, level: 9, a: 0, bpm: 181.5 },
      { key: 'anti', tier: 0, level: 4 },
    ]);
    const plainBefore = songdbCrypt(before, tables);
    const plainAfter = songdbCrypt(r.bytes, tables);
    const diff = [...plainAfter.keys()].filter((i) => plainAfter[i] !== plainBefore[i]);
    expect(diff).toEqual(r.changed);
    // Every changed byte lies in the tier bytes it was about.
    const bluesy = songdbRecordAt(plainBefore, 'bluesy')! + 0x32 + 2 * 9;
    const anti = songdbRecordAt(plainBefore, 'anti')! + 0x32;
    for (const o of r.changed)
      expect(o === anti || (o >= bluesy && o < bluesy + 9), `offset ${o}`).toBe(true);
    const got = parseSongdb(plainAfter);
    expect(got.entries[1]!.steps[2]).toEqual({ level: 9, a: 0, b: f(181.5) });
    expect(got.entries[0]!.steps[0]!.level).toBe(4);
    expect(got.groups).toEqual(parseSongdb(plainBefore).groups);
  });

  it('patches a plaintext table without tables, and refuses what it cannot do', () => {
    const plain = onDisk(db(), 5);
    expect(
      parseSongdb(patchSongdb(plain, undefined, [{ key: 'anti', tier: 3, level: 1 }]).bytes)
        .entries[0]!.steps[3]!.level,
    ).toBe(1);
    const enc = onDisk(db(), 5, tables);
    expect(() => patchSongdb(enc, undefined, [])).toThrow(/encrypted/);
    expect(() => patchSongdb(enc, tables, [{ key: 'gone', tier: 0, level: 1 }])).toThrow(/gone/);
    expect(() => patchSongdb(enc, tables, [{ key: 'anti', tier: 0, level: 256 }])).toThrow(
      RangeError,
    );
    expect(() => patchSongdb(enc, tables, [{ key: 'anti', tier: 0, bpm: 0 }])).toThrow(RangeError);
    // The wrong tables: not EZSL.
    expect(() =>
      patchSongdb(
        enc,
        tables.map((b) => b ^ 1),
        [],
      ),
    ).toThrow(/EZSL/);
  });

  it('for random tables, junk and edits, differs by exactly the edited bytes', () => {
    const key = fc.stringMatching(/^[a-z0-9]{1,12}$/);
    fc.assert(
      fc.property(
        fc.uniqueArray(key, { minLength: 1, maxLength: 8 }),
        fc.uint8Array({ minLength: 64, maxLength: 64 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.array(
          fc.tuple(
            fc.nat(),
            fc.integer({ min: 0, max: 3 }),
            fc.option(fc.integer({ min: 0, max: 20 })),
            fc.option(fc.double({ min: 60, max: 400, noNaN: true })),
          ),
          { maxLength: 6 },
        ),
        (keys, t, junk, edits) => {
          const d: SongDb = {
            entries: keys.map((k, i) => entry(k, [i % 4, 3], 100 + i)),
            groups: Array.from({ length: 47 }, () => []),
          };
          const before = onDisk(d, junk, t);
          const want = structuredClone(d);
          const es = edits.map(([k, tier, level, bpm]) => {
            const e = { key: keys[k % keys.length]!.toUpperCase(), tier: tier as 0 | 1 | 2 | 3 };
            const step = want.entries[k % keys.length]!.steps[tier]!;
            if (level !== null) step.level = level;
            if (bpm !== null) step.b = f(bpm);
            return { ...e, ...(level !== null ? { level } : {}), ...(bpm !== null ? { bpm } : {}) };
          });
          const r = patchSongdb(before, t, es);
          const a = songdbCrypt(before, t);
          const b = songdbCrypt(r.bytes, t);
          expect([...b.keys()].filter((i) => a[i] !== b[i])).toEqual(r.changed);
          expect(parseSongdb(b).entries).toEqual(want.entries);
        },
      ),
      { numRuns: 100, seed: 6031 },
    );
  });
});

// ---- the plan ----------------------------------------------------------------------

describe('a cabinet plan', () => {
  it('lists every song the tables have a folder for, with its title', async () => {
    const { targets } = await alpha();
    expect(targets.map((t) => [t.dir, t.title?.title, Object.keys(t.entries)])).toEqual([
      ['alpha', 'Alpha Song', ['5k', '7k']],
      ['Beta', 'Beta', ['5k']],
    ]);
  });

  it("puts an unedited import back onto the game's own files", async () => {
    const { target, files, game, charts, imp } = await alpha();
    const plan = planCabinet({ target, files, gds: game.gds, charts, source: imp.song.source });
    expect(plan.refused).toEqual([]);
    expect(plan.charts.map((c) => [c.paths.ez, c.exists])).toEqual([
      ['sound/alpha/streetmix1p-alpha.ez', { ez: true, ezi: true, ini: true }],
      ['sound/alpha/StreetMix1p-alpha-hd.ez', { ez: true, ezi: true, ini: false }],
      ['sound/alpha/7streetmix1p-alpha.ez', { ez: true, ezi: true, ini: false }],
    ]);
    expect(plan.charts[1]!.paths.ini).toBe('sound/alpha/StreetMix1p-alpha-hd.ini');
    // song.bin: the same levels, and the table's BPM kept (the charts are its own).
    expect(plan.songdb).toEqual([
      {
        mode: '5k',
        edits: [
          { key: 'alpha', tier: 0, level: 3 },
          { key: 'alpha', tier: 1, level: 7 },
        ],
      },
      { mode: '7k', edits: [{ key: 'alpha', tier: 0, level: 5 }] },
    ]);
  });

  it('adds a tier the game lacks, and refuses what the game has no place for', async () => {
    const { target, files, game, charts, imp } = await alpha();
    const shd = { ...charts[1]!, file: 'x-shd.bmson', tier: 'SHD' as const };
    shd.data = structuredClone(shd.data);
    shd.data.info.level = 12;
    shd.data.info.initBpm = 160;
    const plan = planCabinet({
      target,
      files,
      gds: game.gds,
      charts: [
        ...charts,
        shd,
        { ...charts[0]!, file: 'again.bmson' },
        { ...charts[0]!, file: 'ten.bmson', mode: '10k' },
      ],
      source: imp.song.source,
    });
    expect(plan.refused.map((r) => [r.chart.file, r.reason])).toEqual([
      ['again.bmson', 'a second 5K STANDARD NM chart'],
      [
        'ten.bmson',
        "the game's ClubMix table does not list alpha (a cabinet export can only replace what the game has)",
      ],
    ]);
    const s = plan.charts.at(-1)!;
    expect(s.paths).toEqual({
      ez: 'sound/alpha/streetmix1p-alpha-shd.ez',
      ezi: 'sound/alpha/streetmix1p-alpha-shd.ezi',
      ini: 'sound/alpha/streetmix1p-alpha-shd.ini',
    });
    expect(s.exists).toEqual({ ez: false, ezi: false, ini: false });
    expect(plan.songdb[0]!.edits.at(-1)).toEqual({
      key: 'alpha',
      tier: 2,
      level: 12,
      bpm: 160,
      a: 0,
    });
  });
});

// ---- keysound files -------------------------------------------------------------------

/**
 * What the host would answer for the synthetic song: kick, snare and pad are
 * in the folder already with the same audio; gone and slot 9 have no source.
 */
function answers(plan: ReturnType<typeof planCabinet>) {
  const defs = plan.registry.defs.map((d) => d.name);
  return {
    defs,
    idx: (n: string) => defs.indexOf(n),
    same: (i: number) => (['kick', 'snare', 'pad'].includes(defs[i]!) ? `${defs[i]}.ssf` : null),
    missing: (i: number) => ['gone', 'slot_9'].includes(defs[i]!),
  };
}

describe('keysound files', () => {
  it('uses a file with the same audio, never writes over another, and lists missing ones', async () => {
    const { target, files, game, charts, imp } = await alpha();
    const plan = planCabinet({ target, files, gds: game.gds, charts, source: imp.song.source });
    const { defs, idx, same, missing } = answers(plan);
    expect([...defs].sort()).toEqual(['Beta_Bass', 'gone', 'kick', 'pad', 'slot_9', 'snare']);
    const cand = soundCandidates(plan, [...files, 'Kick~2.ssf', 'kickback.ssf']);
    expect(cand[idx('kick')]).toEqual(['kick.ssf', 'Kick~2.ssf']);
    expect(cand[idx('Beta_Bass')]).toEqual([]);

    const names = nameSounds(plan, files, same, missing);
    const got = (n: string) => names.get(idx(n));
    expect(got('kick')).toEqual({ name: 'kick', write: false });
    expect(got('pad')).toEqual({ name: 'pad', write: false });
    expect(got('Beta_Bass')).toEqual({ name: 'Beta_Bass', write: true });
    expect(got('gone')).toEqual({ name: 'gone', write: false, missing: true });
    expect(got('slot_9')).toEqual({ name: 'slot_9', write: false, missing: true });
    // Different audio under a taken name: the next free one, never one on disk.
    const fresh = nameSounds(plan, [...files, 'KICK~2.ssf'], () => null, missing);
    expect(fresh.get(idx('kick'))).toEqual({ name: 'kick~3', write: true });
    expect(fresh.get(idx('snare'))).toEqual({ name: 'snare~2', write: true });
  });
});

// ---- the bytes, against EZ2PORT --------------------------------------------------------

type OEzi = { entries: { note: number; name: string }[] };
type OSongIni = { found: boolean; raw: Record<string, number> };

describe.skipIf(!ORACLE)('a cabinet export read back by EZ2PORT (oracle)', () => {
  it('encrypts what the game decrypts, and writes only what changes', async () => {
    const { target, files, game, charts, imp, g } = await alpha();
    const plan = planCabinet({ target, files, gds: game.gds, charts, source: imp.song.source });
    const { idx, same, missing } = answers(plan);
    const names = nameSounds(plan, files, same, missing);
    const out = finishCabinet(plan, names, {
      tables: SYNTH_EZ_TABLES,
      songdb: game.songdbFiles,
      songdbTables: game.songdbTables,
      currentIni: (p) => g.files.get(p),
    });
    // Unedited: the .ez and .ezi of each chart, no .ini (the one there says
    // the same; the others had none), no song.bin.
    expect(out.files.map((x) => [x.kind, x.path, x.replaces])).toEqual([
      ['ez', 'sound/alpha/streetmix1p-alpha.ez', true],
      ['ezi', 'sound/alpha/streetmix1p-alpha.ezi', true],
      ['ez', 'sound/alpha/StreetMix1p-alpha-hd.ez', true],
      ['ezi', 'sound/alpha/StreetMix1p-alpha-hd.ezi', true],
      ['ez', 'sound/alpha/7streetmix1p-alpha.ez', true],
      ['ezi', 'sound/alpha/7streetmix1p-alpha.ezi', true],
    ]);
    expect(out.ini).toEqual(['keep', 'none', 'none']);
    expect(out.sounds).toEqual([{ def: idx('Beta_Bass'), path: 'sound/alpha/Beta_Bass.ssf' }]);
    expect([...out.reused].sort()).toEqual([
      'sound/alpha/kick.ssf',
      'sound/alpha/pad.ssf',
      'sound/alpha/snare.ssf',
    ]);

    withTmpDir((dir, write) => {
      const t = { ez: write('ez.t', SYNTH_EZ_TABLES.ez), ezi: write('ezi.t', SYNTH_EZ_TABLES.ezi) };
      for (const file of out.files) {
        const kind = file.kind as 'ez' | 'ezi';
        const dec = `${dir}/dec-${file.path.replace(/\//g, '_')}`;
        oracle(['crypt', 'dec', t[kind], write('enc', file.bytes), dec]);
        expect(new Uint8Array(readFileSync(dec)), file.path).toEqual(file.plain);
        if (kind === 'ez') expect(oracle<{ version: number }>(['chart', dec]).version).toBe(8);
        else
          expect(oracle<OEzi>(['ezi', dec]).entries.map((e) => [e.note, e.name])).toEqual(
            plan.charts
              .find((c) => c.paths.ezi === file.path)!
              .plan.keysoundSlots.map((k, i) => [i + 1, `${names.get(k)!.name}.wav`]),
          );
      }
    });
  });

  it('writes a changed .ini and a changed song.bin the game reads back', async () => {
    const { target, files, game, charts, imp, g } = await alpha();
    const nm = { ...charts[0]!, data: structuredClone(charts[0]!.data) };
    nm.data.info.judgementDeltas = { KOOL: 10, COOL: 28, GOOD: 54, MISS: 74 };
    nm.data.info.level = 4;
    const shd = { ...charts[1]!, tier: 'SHD' as const, data: structuredClone(charts[1]!.data) };
    shd.data.info.level = 12;
    const plan = planCabinet({
      target,
      files,
      gds: game.gds,
      charts: [nm, shd],
      source: imp.song.source,
    });
    const names = nameSounds(plan, files, () => null);
    const out = finishCabinet(plan, names, {
      tables: SYNTH_EZ_TABLES,
      songdb: game.songdbFiles,
      songdbTables: game.songdbTables,
      currentIni: (p) => g.files.get(p),
    });
    expect(out.ini).toEqual(['write', 'none']);
    const bin = out.files.find((x) => x.kind === 'songdb')!;
    expect(bin.path).toBe('system/StreetMix/song.bin');
    withTmpDir((dir, write) => {
      const ini = out.files.find((x) => x.kind === 'ini')!;
      const dec = `${dir}/ini`;
      oracle(['crypt', 'dec', write('t', SYNTH_EZ_TABLES.ini), write('e', ini.bytes), dec]);
      expect(new TextDecoder().decode(readFileSync(dec))).toContain('Kool=10\r\n');
      expect(oracle<OSongIni>(['songini', dec]).raw).toMatchObject({
        level: 4,
        kool: 10,
        miss: 74,
      });

      // song.bin: EZ2PORT decrypts and parses it with the new levels, and
      // finds the new SHD chart once it is written.
      const hex = oracle<{ hex: string }>([
        'songdb-crypt',
        write('bin', bin.bytes),
        write('st', SYNTH_SONGDB_TABLES),
      ]).hex;
      const plain = Uint8Array.from(Buffer.from(hex, 'hex'));
      const parsed = oracle<{ entries: SongEntry[] }>(['songdb', write('plain.bin', plain)]);
      const a = parsed.entries.find((e) => e.key === 'alpha')!;
      expect(a.steps.map((s) => s.level)).toEqual([4, 7, 12, 0]);
      expect(parsed.entries.find((e) => e.key === 'beta')!.steps[0]!.level).toBe(2);
      const root = join(dir, 'game');
      mkdirSync(join(root, 'sound', 'alpha'), { recursive: true });
      for (const fl of [...files, 'streetmix1p-alpha-shd.ez'])
        writeFileSync(join(root, 'sound', 'alpha', fl), '');
      const found = oracle<{
        entries: { key: string; charts: { tier: number; path: string }[] }[];
      }>(['songdb-charts', write('p2.bin', plain), root, 'streetmix']);
      expect(
        found.entries.find((e) => e.key === 'alpha')!.charts.map((c) => [c.tier, c.path]),
      ).toEqual([
        [0, 'sound/alpha/streetmix1p-alpha.ez'],
        [1, 'sound/alpha/StreetMix1p-alpha-hd.ez'],
        [2, 'sound/alpha/streetmix1p-alpha-shd.ez'],
      ]);
    });
    // Decrypting what we wrote with our own cipher gives the plaintext back.
    const ez = out.files.find((x) => x.kind === 'ez')!;
    expect(ez2Decrypt(ez.bytes, SYNTH_EZ_TABLES.ez)).toEqual(ez.plain);
  });
});

// ---- a real install (EZ2_ROOT + EZ2_EXE; skipped without them) -----------------------

const ROOT = process.env.EZ2_ROOT;
const EXE = process.env.EZ2_EXE;

describe.skipIf(!ROOT || !EXE || !existsSync(join(ROOT ?? '', 'system')) || !existsSync(EXE ?? ''))(
  "a real install's song tables (EZ2_ROOT, EZ2_EXE)",
  () => {
    it('patches every entry with its own values without changing a byte', async () => {
      const fs = {
        list: async (d: string) => {
          try {
            return readdirSync(join(ROOT!, d));
          } catch {
            return [];
          }
        },
        read: async (p: string) => {
          try {
            return new Uint8Array(readFileSync(join(ROOT!, p)));
          } catch {
            return undefined;
          }
        },
      };
      const game = await openGame(fs, new Uint8Array(readFileSync(EXE!)));
      const lines: string[] = [];
      for (const [mode, file] of Object.entries(game.songdbFiles)) {
        const db = game.songdbs[mode as keyof typeof game.songdbs]!;
        const edits = db.entries.flatMap((e) =>
          e.steps.map((s, t) => ({
            key: e.key,
            tier: t as 0 | 1 | 2 | 3,
            level: s.level,
            a: s.a,
            bpm: s.b > 0 ? s.b : undefined,
          })),
        );
        const r = patchSongdb(
          file.bytes,
          game.songdbTables,
          edits.filter((e) => e.bpm !== undefined),
        );
        expect(r.changed, file.path).toEqual([]);
        expect(r.bytes).toBe(file.bytes);
        const steps = db.entries.flatMap((e) => e.steps.filter((s) => s.level > 0));
        const aNonZero = steps.filter((s) => s.a !== 0).length;
        const bpms = steps.map((s) => s.b);
        lines.push(
          `${file.path}: ${db.entries.length} songs, ${steps.length} tiers; a != 0 on ${aNonZero}; BPM ${Math.min(...bpms)}-${Math.max(...bpms)}`,
        );
      }
      console.log(lines.join('\n'));
      expect(lines.length).toBeGreaterThan(0);
    });
  },
);
