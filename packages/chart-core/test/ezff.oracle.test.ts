import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EZ_BPM,
  EZ_NOTE,
  EZ_SCROLL,
  nameField,
  readEzff,
  writeEzff,
  type EzffChart,
  type EzffRecord,
} from '../src/io/ez/ezff';
import { EngineTempo } from '../src/timing/engine-tempo';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

interface OracleChart {
  version: number;
  name: string;
  ticks_per_measure: number;
  bpm: number;
  bpm2: number;
  total_ticks: number;
  track_count: number;
  tempo: { tick: number; bpm: number }[];
  tracks: {
    name: string;
    ticks: number;
    records: {
      tick: number;
      type: number;
      ms: number;
      key?: number;
      vel?: number;
      pan?: number;
      kind?: number;
      length?: number;
      bpm?: number;
      raw?: [number, number];
    }[];
  }[];
}

const f32 = (lo: number, hi: number) =>
  fc.double({ min: lo, max: hi, noNaN: true }).map((v) => Math.fround(v));

/** A random chart: 64 tracks, notes on some, distinct-tick BPM records on track 0. */
const chartArb = (version: 6 | 8) =>
  fc
    .record({
      bpm: f32(40, 400),
      bpmTicks: fc.uniqueArray(fc.integer({ min: 1, max: 20_000 }), { maxLength: 12 }),
      bpmValues: fc.array(f32(20, 999), { minLength: 12, maxLength: 12 }),
      notes: fc.array(
        fc.record({
          track: fc.integer({ min: 1, max: 63 }),
          tick: fc.integer({ min: 0, max: 20_000 }),
          key: fc.integer({ min: 0, max: version === 8 ? 2047 : 255 }),
          vel: fc.integer({ min: 0, max: 127 }),
          pan: fc.integer({ min: 0, max: 127 }),
          kind: fc.integer({ min: 0, max: 12 }),
          length: fc.oneof(fc.constant(0), fc.integer({ min: 6, max: 2000 })),
        }),
        { maxLength: 80 },
      ),
      scroll: fc.option(f32(0.25, 4), { nil: undefined }),
    })
    .map(({ bpm, bpmTicks, bpmValues, notes, scroll }): EzffChart => {
      const tracks = Array.from({ length: 64 }, (_, t) => ({
        name: nameField(`track${String(t).padStart(2, '0')}`),
        ticks: 0,
        records: [] as EzffRecord[],
      }));
      bpmTicks.forEach((tick, i) =>
        tracks[0]!.records.push({ tick, type: EZ_BPM, bpm: bpmValues[i]! }),
      );
      if (scroll !== undefined) {
        const raw = new DataView(new ArrayBuffer(4));
        raw.setFloat32(0, scroll, true);
        tracks[0]!.records.push({ tick: 96, type: EZ_SCROLL, raw: [raw.getUint32(0, true), 0] });
      }
      for (const n of notes) {
        const { track, ...rec } = n;
        tracks[track]!.records.push({ ...rec, type: EZ_NOTE });
      }
      let total = 0;
      for (const t of tracks) {
        t.records.sort((a, b) => a.tick - b.tick);
        t.ticks = t.records.at(-1)?.tick ?? 0;
        total = Math.max(total, t.ticks);
      }
      return {
        version,
        name: nameField('테스트 song'),
        name2: new Uint8Array(),
        ticksPerMeasure: 192,
        bpm,
        bpm2: bpm,
        totalTicks: total + 48,
        tracks,
      };
    });

describe('EZFF writer', () => {
  it('round-trips through its own reader', () => {
    fc.assert(
      fc.property(fc.constantFrom<6 | 8>(6, 8).chain(chartArb), (c) => {
        const back = readEzff(writeEzff(c));
        expect(back).toEqual(c);
      }),
      { numRuns: 40 },
    );
  });
});

describe.skipIf(!ORACLE)('EZFF + tempo against EZ2PORT (oracle)', () => {
  it('the engine parses what we write, field for field, and times every record identically', () => {
    fc.assert(
      fc.property(fc.constantFrom<6 | 8>(6, 8).chain(chartArb), (c) => {
        withTmpDir((_dir, write) => {
          const path = write('c.ez', writeEzff(c));
          const o = oracle<OracleChart>(['chart', path]);
          expect(o.version).toBe(c.version);
          expect(o.ticks_per_measure).toBe(192);
          // The oracle prints floats as %.9g: exact for an f32 once read back as one.
          expect(Math.fround(o.bpm)).toBe(c.bpm);
          expect(o.total_ticks).toBe(c.totalTicks);
          expect(o.track_count).toBe(64);

          const bpmRecs = c.tracks[0]!.records.filter((r) => r.type === EZ_BPM);
          const tempo = new EngineTempo(
            c.bpm,
            bpmRecs.map((r) => ({ tick: r.tick, bpm: r.bpm! })),
          );
          expect(o.tempo.map((p) => ({ tick: p.tick, bpm: Math.fround(p.bpm) }))).toEqual(
            tempo.points,
          );

          c.tracks.forEach((t, ti) => {
            const ot = o.tracks[ti]!;
            expect(ot.ticks).toBe(t.ticks);
            expect(ot.records.length).toBe(t.records.length);
            t.records.forEach((r, ri) => {
              const or = ot.records[ri]!;
              expect(or.tick).toBe(r.tick);
              expect(or.type).toBe(r.type);
              // Bit-identical milliseconds: the editor's time IS the engine's.
              expect(or.ms).toBe(tempo.msAt(r.tick));
              if (r.type === EZ_NOTE) {
                expect([or.key, or.vel, or.pan, or.kind, or.length]).toEqual([
                  r.key,
                  r.vel,
                  r.pan,
                  r.kind,
                  r.length,
                ]);
              }
              if (r.type === EZ_BPM) expect(Math.fround(or.bpm!)).toBe(r.bpm);
              if (r.type === EZ_SCROLL) expect(or.raw![0]).toBe(r.raw![0]);
            });
          });
        });
      }),
      { numRuns: 25 },
    );
  });
});
