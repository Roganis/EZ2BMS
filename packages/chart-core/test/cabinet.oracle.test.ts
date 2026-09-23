// A game chart, imported and compiled for the cabinet (M6), read back by
// EZ2PORT's own parser (ez2_chart_parse + ez2_tempo_build via the oracle):
// with nothing edited it must be the game's chart again - every note on the
// track it had, at the tick and millisecond it had, with the sound, velocity,
// pan, kind and raw length it had; every record bmson has no place for back
// where it was; the same tempo map; the same header. Two things are allowed
// to differ, as docs/ez2port-compat.md says: tempo records are rewritten on
// track 0 (only the map they make is compared), and keysound slots are
// renumbered (sounds are compared by file).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { synthGame } from '../src/dev/synthgame';
import { ezSongSource, memoryGameFs, openGame } from '../src/io/ez/game';
import { eziTable, parseEzi } from '../src/io/ez/ezi';
import {
  EZ_NOTE,
  nameField,
  readEzff,
  writeEzff,
  type EzffChart,
  type EzffRecord,
} from '../src/io/ez/ezff';
import { ez2Decrypt, looksPlaintext } from '../src/ez2data/crypt';
import { importEzSong } from '../src/io/ez/import';
import type { ChartData } from '../src/model/types';
import type { ModeId } from '../src/modes/ids';
import { columnsFromGds, modeDef } from '../src/modes/registry';
import type { Gds } from '../src/ez2data/gds';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

type ORecord = {
  tick: number;
  type: number;
  ms: number;
  key?: number;
  vel?: number;
  pan?: number;
  kind?: number;
  length?: number;
  bpm?: number;
  value?: number;
  raw?: [number, number];
};
type OChart = {
  name: string;
  name2: string;
  ticks_per_measure: number;
  bpm: number;
  bpm2: number;
  total_ticks: number;
  track_count: number;
  tempo: { tick: number; bpm: number }[];
  tracks: { records: ORecord[] }[];
};

/** A file name as a sound: no folder, no extension, any case ("slot N" for a slot the .ezi lacks). */
const soundId = (name: string | undefined, key: number) =>
  name === undefined
    ? `slot ${key}`
    : name
        .replace(/^.*[\\/]/, '')
        .replace(/\.[^.]*$/, '')
        .toLowerCase();

/** What must come back: notes and kept records as multisets, the tempo map, the header. */
function summary(c: OChart, soundOf: (key: number) => string) {
  const notes: string[] = [];
  const kept: string[] = [];
  c.tracks.forEach((t, ti) => {
    for (const r of t.records) {
      if (r.type === EZ_NOTE)
        notes.push(
          `${ti} ${r.tick} ${r.ms} ${soundOf(r.key!)} ${r.vel} ${r.pan} ${r.kind} ${r.length}`,
        );
      else if (!(r.type === 3 && r.bpm! > 0 && r.bpm! <= 1000))
        kept.push(`${ti} ${r.tick} ${r.type} ${r.value ?? ''} ${r.bpm ?? ''} ${r.raw ?? ''}`);
    }
  });
  const { name, name2, bpm, bpm2, ticks_per_measure, total_ticks, track_count, tempo } = c;
  // The tempo map as the engine plays it: the last point at a tick governs, and
  // a point that keeps the tempo changes nothing (the game's charts often
  // repeat the header's BPM in a record at tick 0).
  const map: { tick: number; bpm: number }[] = [];
  for (const p of tempo) {
    if (map.at(-1)?.tick === p.tick) map.pop();
    if (map.at(-1)?.bpm !== p.bpm) map.push(p);
  }
  return {
    header: { name, name2, bpm, bpm2, ticks_per_measure, total_ticks, track_count },
    tempo: map,
    notes: notes.sort(),
    kept: kept.sort(),
  };
}

function cabinetBytes(data: ChartData, mode: ModeId, gds: Gds | undefined) {
  const reg = new KeysoundRegistry();
  const columns = gds ? columnsFromGds(mode, gds).columns : modeDef(mode).columns;
  const plan = compileChart(data, { columns, name: 'x', keysounds: reg, target: 'cabinet' });
  return {
    plan,
    bytes: writeEzff(plan.ezff),
    soundOf: (key: number) => soundId(reg.defs[plan.keysoundSlots[key - 1]!]?.src, key),
  };
}

describe.skipIf(!ORACLE)('cabinet export against EZ2PORT (oracle)', () => {
  it("gives the synthetic game's charts back as the game has them", async () => {
    const g = synthGame();
    const game = await openGame(memoryGameFs(g.files), g.exe);
    const imp = importEzSong(await ezSongSource(game, game.songs[0]!));
    expect(imp.charts).toHaveLength(3);
    withTmpDir((dir, write) => {
      for (const c of imp.charts) {
        const path = `sound/alpha/${c.from}`;
        const orig = g.files.get(path)!;
        const ezi = eziTable(parseEzi(g.files.get(path.replace(/\.ez$/, '.ezi'))!));
        const theirs = oracle<OChart>(['chart', write(`a-${c.from}`, orig)]);
        const ours = cabinetBytes(c.data, c.mode, game.gds[c.mode]);
        const back = oracle<OChart>(['chart', write(`b-${c.from}`, ours.bytes)]);
        expect(summary(back, ours.soundOf), c.from).toEqual(
          summary(theirs, (k) => soundId(ezi.get(k)?.name, k)),
        );
        expect(ours.plan.cabinet).toMatchObject({ repinned: 0, grown: 0 });
      }
      // What the StreetMix NM chart carries: three background notes on their
      // own tracks (1, which also has a volume record, 8 and 22), a scroll
      // record, a background note with a length.
      const nm = cabinetBytes(imp.charts[0]!.data, '5k', game.gds['5k']).plan;
      expect(nm.cabinet).toMatchObject({ kept: 2, pinned: 3, pinnedCuts: 0 });
      expect(nm.ezff.tracks.length).toBe(23);
    });
  });

  it('gives random game charts back, record for record', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(gameChartArb, (ez) => {
          const names = ['kick.wav', 'snare.wav', 'hat.wav', 'pad.wav', 'bass.wav', 'fx.wav'];
          const ezi = new TextEncoder().encode(names.map((n, i) => `${i + 1} 1 ${n}`).join('\r\n'));
          const files = new Map<string, Uint8Array>([
            ['sound/rnd/streetmix1p-rnd.ez', ez],
            ['sound/rnd/streetmix1p-rnd.ezi', ezi],
            ...names.map((n): [string, Uint8Array] => [
              `sound/rnd/${n.replace('.wav', '.ssf')}`,
              new Uint8Array(20),
            ]),
          ]);
          const imp = importEzSong({
            dir: 'rnd',
            charts: [{ file: 'streetmix1p-rnd.ez', ez, ezi }],
            locate: (p) => [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase()),
            shipped: ['rnd'],
          });
          const theirs = oracle<OChart>(['chart', write('a.ez', ez)]);
          const ours = cabinetBytes(imp.charts[0]!.data, '5k', undefined);
          const back = oracle<OChart>(['chart', write('b.ez', ours.bytes)]);
          expect(summary(back, ours.soundOf)).toEqual(
            summary(theirs, (k) => soundId(names[k - 1], k)),
          );
        }),
        { numRuns: 60, seed: 6021 },
      );
    });
  });
});

/**
 * A random game chart (StreetMix: lanes on tracks 3-7, 10, 11): notes on
 * every track - background on 0 and 21 too, several on one tick - with any
 * velocity, pan, kind and raw length; tempo records on any track, some at tick
 * 0, some out of range; volume, beats, mark, scroll and unknown records.
 */
const gameChartArb = fc
  .record({
    bpm: fc.constantFrom(120, 150, 174.5, 88.8, 0),
    bpm2: fc.constantFrom(120, 150, 0),
    tempo: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 40 }),
        fc.constantFrom(90, 140.6, 200, 333.3, 1500, -5),
      ),
      { maxLength: 6 },
    ),
    notes: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 24 }), // track
        fc.integer({ min: 0, max: 40 * 48 }), // tick
        fc.integer({ min: 1, max: 8 }), // key (7, 8: not in the .ezi)
        fc.constantFrom(0, 0, 0, 3, 6, 6 + 24, 6 + 96, 200), // raw length
        fc.integer({ min: 0, max: 127 }),
        fc.integer({ min: 0, max: 127 }),
        fc.constantFrom(0, 0, 1, 2, 3),
      ),
      { minLength: 1, maxLength: 50 },
    ),
    other: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 40 * 48 }),
        fc.constantFrom(2, 4, 5, 6, 7, 9),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 0xffffffff }),
      ),
      { maxLength: 8 },
    ),
    trackCount: fc.integer({ min: 25, max: 40 }),
    totalTicks: fc.constantFrom(40 * 48, 50 * 48, 100),
  })
  .map(({ bpm, bpm2, tempo, notes, other, trackCount, totalTicks }) => {
    const recs: [number, EzffRecord][] = [
      ...tempo.map(([t, q, b]): [number, EzffRecord] => [t, { tick: q * 48, type: 3, bpm: b }]),
      ...notes.map(([t, tick, key, length, vel, pan, kind]): [number, EzffRecord] => [
        t,
        { tick, type: EZ_NOTE, key, vel, pan, kind, length },
      ]),
      ...other.map(([t, tick, type, value, word]): [number, EzffRecord] => [
        t,
        type === 2 || type === 4
          ? { tick, type, value }
          : type === 5
            ? { tick, type }
            : { tick, type, raw: [word, word ^ 0x5a5a5a5a] },
      ]),
    ];
    const tracks = Array.from({ length: trackCount }, () => ({
      name: new Uint8Array(),
      ticks: 0,
      records: [] as EzffRecord[],
    }));
    for (const [t, r] of recs) tracks[t]!.records.push(r);
    for (const t of tracks) t.records.sort((a, b) => a.tick - b.tick);
    return writeEzff({
      version: 8,
      name: nameField('rnd'),
      name2: nameField('two'),
      ticksPerMeasure: 192,
      bpm,
      bpm2,
      totalTicks,
      tracks,
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

/** Notes, kept records and header of a plaintext chart, by the TypeScript reader. */
function tsSummary(c: EzffChart, soundOf: (key: number) => string) {
  const notes: string[] = [];
  const kept: string[] = [];
  c.tracks.forEach((t, ti) => {
    for (const r of t.records) {
      if (r.type === EZ_NOTE)
        notes.push(`${ti} ${r.tick} ${soundOf(r.key!)} ${r.vel} ${r.pan} ${r.kind} ${r.length}`);
      else if (!(r.type === 3 && Math.fround(r.bpm!) > 0 && Math.fround(r.bpm!) <= 1000))
        kept.push(`${ti} ${r.tick} ${r.type} ${r.value ?? ''} ${r.bpm ?? ''} ${r.raw ?? ''}`);
    }
  });
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return {
    header: [
      hex(c.name),
      hex(c.name2),
      c.bpm,
      c.bpm2,
      c.ticksPerMeasure,
      c.totalTicks,
      c.tracks.length,
    ],
    notes: notes.sort(),
    kept: kept.sort(),
  };
}

describe.skipIf(!ROOT || !EXE || !existsSync(join(ROOT ?? '', 'sound')) || !existsSync(EXE ?? ''))(
  'a real install, re-planned for the cabinet (EZ2_ROOT, EZ2_EXE)',
  () => {
    it('gives every shipped chart back as the game has it', { timeout: 60 * 60_000 }, async () => {
      const g = await openGame(diskFs(ROOT!), new Uint8Array(readFileSync(EXE!)));
      expect(g.tables, g.tablesError).toBeDefined();
      const plain = (kind: 'ez' | 'ezi', b: Uint8Array) =>
        looksPlaintext(kind, b) ? b : ez2Decrypt(b, g.tables![kind]);
      let charts = 0;
      let largest = { size: 0, file: '' };
      const bad: string[] = [];
      for (const s of g.songs) {
        const src = await ezSongSource(g, s);
        for (const f of src.charts)
          for (const [kind, b] of [
            ['ez', f.ez],
            ['ezi', f.ezi],
            ['ini', f.ini],
          ] as const)
            if (b && b.length > largest.size)
              largest = { size: b.length, file: `${s.dir}/${f.file} (${kind})` };
        const imp = importEzSong(src);
        for (const c of imp.charts) {
          const f = src.charts.find((x) => x.file === c.from)!;
          const ezi = f.ezi ? eziTable(parseEzi(plain('ezi', f.ezi))) : new Map();
          const ours = cabinetBytes(c.data, c.mode, g.gds[c.mode]);
          const theirs = tsSummary(readEzff(plain('ez', f.ez)), (k) =>
            soundId(ezi.get(k)?.name, k),
          );
          const back = tsSummary(readEzff(ours.bytes), ours.soundOf);
          charts++;
          try {
            expect(back).toEqual(theirs);
          } catch {
            bad.push(`${s.dir}/${c.from}`);
          }
        }
      }
      console.log(
        `${charts} charts re-planned, ${bad.length} differ: ${bad.slice(0, 20).join(', ')}`,
      );
      console.log(`largest encrypted file: ${largest.size} bytes, ${largest.file}`);
      expect(bad).toEqual([]);
      // The original decrypts into a 131068-byte buffer (ez2/crypt.c): no shipped file is larger.
      expect(largest.size).toBeLessThanOrEqual(131068);
    });
  },
);
