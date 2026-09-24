// The game's own charts into EZ2BMS songs (io/ez/import.ts, game.ts), on the
// synthetic data folder (dev/synthgame.ts): what each chart becomes, what is
// kept that bmson has no place for, what is said about it - and, against
// EZ2PORT's own reader, that every note plays when the port plays it and a
// re-publish gives the lanes back record for record.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { synthGame } from '../src/dev/synthgame';
import { ezSongSource, memoryGameFs, openGame, type Game } from '../src/io/ez/game';
import { f32Decimal, gamePath, importEzSong } from '../src/io/ez/import';
import { EZ_NOTE, nameField, writeEzff, type EzffRecord } from '../src/io/ez/ezff';
import { serializeBmson } from '../src/io/bmson/serialize';
import { parseBmson } from '../src/io/bmson/parse';
import { lintChart } from '../src/lint/lint';
import { modeDef } from '../src/modes/registry';
import { ChartClock } from '../src/publish/chart-plan';
import { compileSong } from '../src/publish/package';
import { parseSongFile, serializeSongFile } from '../src/song/songfile';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

async function game(): Promise<Game> {
  const g = synthGame();
  const manifest = new TextDecoder().decode(g.files.get('text/manifest.songs.ini'));
  return openGame(memoryGameFs(g.files), g.exe, manifest);
}

describe('the game folder', () => {
  it('lists the songs its tables offer, with titles, tiers, levels and BPM', async () => {
    const g = await game();
    expect(g.problems).toEqual([]);
    expect(g.tablesError).toBeDefined(); // a made-up executable has no chart keys: plaintext needs none
    expect(g.songs.map((s) => [s.dir, s.title?.title, s.bpm])).toEqual([
      ['alpha', 'Alpha Song', 150],
      ['Beta', 'Beta', 128],
    ]);
    const alpha = g.songs[0]!;
    expect(alpha.charts.map((c) => [c.mode, c.tier, c.level, c.file])).toEqual([
      ['5k', 'NM', 3, 'streetmix1p-alpha.ez'],
      ['5k', 'HD', 7, 'StreetMix1p-alpha-hd.ez'],
      ['7k', 'NM', 5, '7streetmix1p-alpha.ez'],
    ]);
  });
});

describe('importing a song', () => {
  it('makes a chart per .ez, named for a new key, with the song file', async () => {
    const g = await game();
    const imp = importEzSong(await ezSongSource(g, g.songs[0]!));
    // "alphasong" is a folder under sound/: the key must not hijack it.
    expect(imp.key).toBe('alphasong2');
    expect(imp.charts.map((c) => [c.file, c.from])).toEqual([
      ['streetmix1p-alphasong2.bmson', 'streetmix1p-alpha.ez'],
      ['streetmix1p-alphasong2-hd.bmson', 'StreetMix1p-alpha-hd.ez'],
      ['7streetmix1p-alphasong2.bmson', '7streetmix1p-alpha.ez'],
    ]);
    expect(imp.song.key).toBe('alphasong2');
    expect(imp.song.category).toBe(9); // PLT, its version bank
    expect(imp.song.source).toMatchObject({ from: 'ez2ac', key: 'alpha' });
    expect(imp.notes.map((n) => n.rule)).toEqual(['import-key']);
    // The song file keeps it all through a save.
    const again = parseSongFile(serializeSongFile(imp.song));
    expect(again.warnings).toEqual([]);
    expect(again.song.source).toEqual(imp.song.source);
  });

  it('puts every note where the port plays it, and keeps the rest', async () => {
    const g = await game();
    const imp = importEzSong(await ezSongSource(g, g.songs[0]!));
    const c = imp.charts[0]!;
    const d = c.data;
    expect(d.info).toMatchObject({
      title: 'Alpha Song',
      subtitle: '(Synthetic)',
      level: 3, // the table's, not the .ini's 1
      initBpm: 150,
      resolution: 240,
      tier: 'NM',
      modeHint: 'ez2-5k',
      judgementDeltas: { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 },
      lifeDeltas: { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 },
    });
    expect(d.bpmEvents).toEqual([{ y: 4 * 960, bpm: 175.3 }]);
    const ch = (id: number) => d.channels.find((x) => x.id === id)!.name;
    const at = (y: number, x: number) => d.notes.find((n) => n.y === y && n.x === x)!;
    const M = 960;
    // Keys on tracks 3-7, the turntable on 10, the pedal on 11.
    expect(
      [at(M, 11), at(M + 240, 12), at(3 * M, 14), at(4 * M, 1), at(4 * M + 240, 10)].map((n) =>
        ch(n.ch),
      ),
    ).toEqual(['kick.wav', 'snare.wav', 'kick.wav', 'snare.wav', 'kick.wav']);
    // The hold: 96 ticks, velocity, pan and kind.
    expect(at(2 * M, 13)).toMatchObject({ l: 480, vel: 100, pan: 30, kind: 2 });
    // Slot 6's file is missing; the note keeps its name.
    expect(ch(at(3 * M + 120, 15).ch)).toBe('gone.wav');
    // Background: the pad on track 1, a StreetMix-less effector track, a note with a length.
    const bg = d.notes.filter((n) => n.x === 0).map((n) => [n.y, ch(n.ch), n.extra]);
    expect(bg).toEqual([
      [0, 'pad.wav', { x_track: 1 }],
      [5 * M, 'snare.wav', { x_track: 8 }],
      [5 * M, 'Beta/Bass.wav', { x_track: 22, x_len: 20 }],
    ]);
    // A note on a slot the .ezi does not list.
    expect(ch(at(6 * M, 11).ch)).toBe('slot 9.wav');
    // The scroll change (track 0, second word 0: nothing else to keep).
    expect(d.scrollEvents).toEqual([{ y: 2 * M, rate: 2 }]);
    // What bmson has no place for.
    expect(d.extra.x_ez_records).toEqual([{ track: 1, y: 0, type: 2, value: 100 }]);
    expect(d.extra.x_ez).toMatchObject({
      version: 8,
      name: 'synthetic',
      bpm: 150,
      ticks_per_measure: 192,
    });
    expect(c.notes.map((n) => n.rule).sort()).toEqual([
      'import-kept',
      'import-kept',
      'import-missing-sound',
      'import-missing-sound',
      'import-scroll',
      'import-shared-voice',
    ]);
    // Keysounds to copy: the song's own at the top, Beta's under its folder, as .wav.
    // In the order the charts first use them.
    expect(imp.copies).toEqual([
      { from: 'sound/alpha/pad.ssf', to: 'pad.wav', convert: 'pcm' },
      { from: 'sound/alpha/kick.ssf', to: 'kick.wav', convert: 'pcm' },
      { from: 'sound/alpha/snare.ssf', to: 'snare.wav', convert: 'pcm' },
      { from: 'sound/Beta/Bass.ssf', to: 'Beta/Bass.wav', convert: 'pcm' },
    ]);
    // It is plain bmson: it saves and reads back unchanged.
    const text = serializeBmson(d);
    expect(serializeBmson(parseBmson(text).chart)).toBe(text);
    // And its notes reach Issues.
    const f = lintChart({ file: c.file, data: d, mode: c.mode, tier: c.tier, notes: c.notes });
    expect(f.some((x) => x.rule === 'import-scroll')).toBe(true);
  });

  it('uses the engine defaults with no .ini, 7K lanes, and legacy note names', async () => {
    const g = await game();
    const alpha = importEzSong(await ezSongSource(g, g.songs[0]!));
    const hd = alpha.charts[1]!;
    expect(hd.data.info.level).toBe(7);
    expect(hd.data.info.judgementDeltas).toEqual({ KOOL: 6, COOL: 24, GOOD: 36, MISS: 72 });
    expect(hd.notes.map((n) => n.rule)).toEqual(['import-no-ini']);
    const seven = alpha.charts[2]!;
    expect(seven.mode).toBe('7k');
    // Tracks 8 and 9 are keys 6 and 7 in 7StreetMix.
    expect(seven.data.notes.filter((n) => n.x).map((n) => n.x)).toEqual([31, 32]);

    const beta = importEzSong(await ezSongSource(g, g.songs[1]!));
    // Its own key is a shipped one.
    expect(beta.key).toBe('beta2');
    expect(beta.song.category).toBe(4); // 1st, listed as BETA
    const d = beta.charts[0]!.data;
    const names = d.notes.map((n) => d.channels.find((c) => c.id === n.ch)!.name);
    expect(names).toEqual(['Bass.wav', 'alpha/kick.wav']);
    expect(beta.charts[0]!.notes.map((n) => n.rule)).toContain('import-legacy-ezi');
    expect(d.info.level).toBe(2);
    expect(d.info.initBpm).toBe(128);
  });

  it('says why a chart is left out', async () => {
    const g = synthGame();
    // An encrypted-looking .ez with no executable keys.
    g.files.set('sound/alpha/streetmix1p-alpha.ez', new Uint8Array([1, 2, 3, 4, 5]));
    const manifest = new TextDecoder().decode(g.files.get('text/manifest.songs.ini'));
    const game2 = await openGame(memoryGameFs(g.files), g.exe, manifest);
    const imp = importEzSong(await ezSongSource(game2, game2.songs[0]!));
    expect(imp.charts.map((c) => c.from)).toEqual([
      'StreetMix1p-alpha-hd.ez',
      '7streetmix1p-alpha.ez',
    ]);
    expect(imp.notes.find((n) => n.rule === 'import-skipped')!.message).toMatch(/encrypted/);
  });
});

describe('helpers', () => {
  it('writes f32 values as their shortest decimal', () => {
    expect(f32Decimal(Math.fround(175.3))).toBe(175.3);
    expect(f32Decimal(Math.fround(0.1))).toBe(0.1);
    expect(f32Decimal(150)).toBe(150);
    fc.assert(
      fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (v) => {
        expect(Math.fround(f32Decimal(v))).toBe(Math.fround(v));
      }),
    );
  });

  it('resolves relative keysound paths as the port does', () => {
    expect(gamePath('sound/alpha', '..\\..\\sound\\stay\\p_MR.ssf')).toBe('sound/stay/p_MR.ssf');
    expect(gamePath('sound/alpha', 'kick.ssf')).toBe('sound/alpha/kick.ssf');
    expect(gamePath('sound/alpha', '.\\sub/x.ssf')).toBe('sound/alpha/sub/x.ssf');
  });
});

// ---- against EZ2PORT's own reader ------------------------------------------------

/** A random StreetMix chart: tempo records on any track (some at one tick, some out of range), notes and holds everywhere. */
const chartArb = fc
  .record({
    bpm: fc.constantFrom(120, 150, 174.5, 88.8, 0),
    tempo: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 40 }),
        fc.constantFrom(90, 140.6, 200, 333.3, 1500, -5),
      ),
      { maxLength: 6 },
    ),
    notes: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 24 }), // track
        fc.integer({ min: 0, max: 40 * 48 }), // tick
        fc.integer({ min: 1, max: 6 }), // key
        fc.constantFrom(0, 0, 0, 3, 6, 6 + 24, 6 + 96), // raw length
        fc.integer({ min: 0, max: 127 }),
      ),
      { minLength: 1, maxLength: 40 },
    ),
  })
  .map(({ bpm, tempo, notes }) => {
    const recs: [number, EzffRecord][] = [
      ...tempo.map(([t, q, b]): [number, EzffRecord] => [t, { tick: q * 48, type: 3, bpm: b }]),
      ...notes.map(([t, tick, key, length, vel]): [number, EzffRecord] => [
        t,
        { tick, type: EZ_NOTE, key, vel, pan: 64, kind: 0, length },
      ]),
    ];
    const tracks = Array.from({ length: 25 }, () => ({
      name: new Uint8Array(),
      ticks: 0,
      records: [] as EzffRecord[],
    }));
    for (const [t, r] of recs) tracks[t]!.records.push(r);
    for (const t of tracks) t.records.sort((a, b) => a.tick - b.tick);
    return writeEzff({
      version: 8,
      name: nameField('r'),
      name2: new Uint8Array(),
      ticksPerMeasure: 192,
      bpm,
      bpm2: bpm,
      totalTicks: 40 * 48,
      tracks,
    });
  });

type OracleChart = {
  tempo: { tick: number; bpm: number }[];
  tracks: {
    records: {
      tick: number;
      type: number;
      key?: number;
      vel?: number;
      length?: number;
      ms: number;
    }[];
  }[];
};

describe.skipIf(!ORACLE)('imported charts against EZ2PORT (oracle)', () => {
  it('every note plays when the engine plays it, and a re-publish gives the lanes back', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(chartArb, (ez) => {
          const theirs = oracle<OracleChart>(['chart', write('a.ez', ez)]);
          const names = ['kick.wav', 'snare.wav', 'hat.wav', 'pad.wav', 'bass.wav', 'fx.wav'];
          const ezi = names.map((n, i) => `${i + 1} 1 ${n}`).join('\r\n');
          const files = new Map<string, Uint8Array>([
            ['sound/rnd/streetmix1p-rnd.ez', ez],
            ['sound/rnd/streetmix1p-rnd.ezi', new TextEncoder().encode(ezi)],
            ...names.map((n): [string, Uint8Array] => [
              `sound/rnd/${n.replace('.wav', '.ssf')}`,
              new Uint8Array(20),
            ]),
          ]);
          const imp = importEzSong({
            dir: 'rnd',
            charts: [
              { file: 'streetmix1p-rnd.ez', ez, ezi: files.get('sound/rnd/streetmix1p-rnd.ezi')! },
            ],
            locate: (p) => [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase()),
            shipped: ['rnd'],
          });
          const data = imp.charts[0]!.data;

          // Times: the chart's clock at every note is the engine's, to the bit.
          const clock = new ChartClock(data);
          const msAt = new Map<number, number>();
          for (const t of theirs.tracks) for (const r of t.records) msAt.set(r.tick, r.ms);
          for (const n of data.notes) {
            const tick = clock.tick(n.y);
            expect(tick * 5).toBe(n.y);
            expect(clock.msAt(tick), `tick ${tick}`).toBe(msAt.get(tick));
          }

          // Lanes: published and read back by the engine, record for record.
          const plan = compileSong({ key: 'rnd', title: '', artist: '', genre: '' }, [
            { data, mode: '5k', tier: 'NM' },
          ]);
          const pc = plan.charts[0]!.plan;
          const ourNames = pc.keysoundSlots.map((i) => `${plan.registry.defs[i]!.name}.wav`);
          const pub = oracle<OracleChart>([
            'chart',
            write('b.ez', pc.ezff ? writeEzff(pc.ezff) : new Uint8Array()),
          ]);
          const lanes = new Set(modeDef('5k').columns.map((c) => c.track));
          const laneRecs = (c: OracleChart, nameOf: (k: number) => string) =>
            c.tracks
              .flatMap((t, ti) =>
                lanes.has(ti)
                  ? t.records
                      .filter((r) => r.type === EZ_NOTE)
                      .map(
                        (r) =>
                          `${ti} ${r.tick} ${nameOf(r.key!)} ${r.vel} ${(r.length ?? 0) > 6 ? r.length : 0}`,
                      )
                  : [],
              )
              .sort();
          const bgRecs = (c: OracleChart, nameOf: (k: number) => string) =>
            c.tracks
              .flatMap((t, ti) =>
                lanes.has(ti)
                  ? []
                  : t.records
                      .filter((r) => r.type === EZ_NOTE)
                      .map((r) => `${r.tick} ${nameOf(r.key!)}`),
              )
              .sort();
          const theirName = (k: number) => names[k - 1]!;
          const ourName = (k: number) => ourNames[k - 1]!;
          expect(laneRecs(pub, ourName)).toEqual(laneRecs(theirs, theirName));
          expect(bgRecs(pub, ourName)).toEqual(bgRecs(theirs, theirName));
          // And the published tempo is the engine's.
          expect(pub.tempo.at(0)).toEqual(theirs.tempo.reduce((a, p) => (p.tick === 0 ? p : a)));
        }),
        { numRuns: 40, seed: 5041 },
      );
    });
  });
});

// ---- a real install (EZ2_ROOT + EZ2_EXE; skipped without them) -----------------------

const ROOT = process.env.EZ2_ROOT;
const EXE = process.env.EZ2_EXE;

/** A GameFs over a real folder, matched as the listing spells it. */
function diskFs(root: string) {
  return {
    list: async (dir: string) => {
      try {
        return readdirSync(join(root, dir));
      } catch {
        return [];
      }
    },
    read: async (p: string) => {
      try {
        return new Uint8Array(readFileSync(join(root, p)));
      } catch {
        return undefined;
      }
    },
  };
}

describe.skipIf(!ROOT || !EXE || !existsSync(join(ROOT ?? '', 'sound')) || !existsSync(EXE ?? ''))(
  'a real install (EZ2_ROOT, EZ2_EXE)',
  () => {
    it('imports every song the tables offer', { timeout: 30 * 60_000 }, async () => {
      const manifestPath = [join(ROOT!, 'text', 'manifest.songs.ini')].find((p) => existsSync(p));
      const g = await openGame(
        diskFs(ROOT!),
        new Uint8Array(readFileSync(EXE!)),
        manifestPath ? readFileSync(manifestPath, 'utf8') : undefined,
      );
      expect(g.problems).toEqual([]);
      let charts = 0;
      let skipped = 0;
      let notes = 0;
      const rules = new Map<string, number>();
      for (const s of g.songs) {
        const imp = importEzSong(await ezSongSource(g, s));
        charts += imp.charts.length;
        skipped += imp.notes.filter((n) => n.rule === 'import-skipped').length;
        for (const c of imp.charts) {
          notes += c.data.notes.length;
          for (const n of c.notes) rules.set(n.rule, (rules.get(n.rule) ?? 0) + 1);
          expect(c.data.info.level).toBeGreaterThanOrEqual(1);
        }
        expect(g.sound.map((d) => d.toLowerCase())).not.toContain(imp.key);
      }
      console.log(
        `${g.songs.length} songs, ${charts} charts, ${notes} notes, ${skipped} charts left out`,
      );
      console.log([...rules].map(([r, n]) => `${r}: ${n}`).join('\n'));
      expect(charts).toBeGreaterThan(0);
      expect(skipped).toBe(0);
    });
  },
);
