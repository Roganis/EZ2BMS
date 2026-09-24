// The BGA a bmson folder publishes (publish/bga.ts chartBga) against the one
// EZ2PORT's importer writes (ez2_bmson_import, song.ini [Bga]), for random
// charts: the same movie picked from bga_header by the earliest event, the
// same StartMs through tempo changes and STOPs before it.
//
// EZ2BMS times the event on the engine's clock (f32 BPM), the importer on the
// bmson's double BPM, so with a BPM that f32 cannot hold the two may part by
// a millisecond at a rounding edge; with BPMs f32 holds exactly they agree.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import { chartBga } from '../src/publish/bga';
import { readSongIni } from '../src/publish/songini-read';
import { TickConverter } from '../src/timing/ticks';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const chart = (exactBpm: boolean) =>
  fc.record({
    init: exactBpm
      ? fc.integer({ min: 60, max: 300 })
      : fc.double({ min: 60, max: 300, noNaN: true }),
    bpms: fc.array(
      fc.record({
        y: fc.integer({ min: 1, max: 40_000 }),
        bpm: exactBpm
          ? fc.integer({ min: 40, max: 400 }).map((b) => b / 4)
          : fc.double({ min: 40, max: 400, noNaN: true }),
      }),
      { maxLength: 5 },
    ),
    stops: fc.array(
      fc.record({
        y: fc.integer({ min: 0, max: 40_000 }),
        duration: fc.integer({ min: 1, max: 960 }),
      }),
      { maxLength: 3 },
    ),
    // Several movies; events pointing at them, the earliest wins.
    header: fc.uniqueArray(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 3 }),
    events: fc.array(fc.record({ y: fc.integer({ min: 0, max: 50_000 }), pick: fc.nat() }), {
      maxLength: 4,
    }),
  });

describe.skipIf(!ORACLE)("the BGA against EZ2PORT's importer", () => {
  for (const exact of [true, false])
    it(`picks the same movie and start${exact ? '' : ' (to a millisecond, any BPM)'}`, () => {
      let late = 0;
      fc.assert(
        fc.property(chart(exact), (c) =>
          withTmpDir((dir) => {
            const data = newChart({ mode: '5k', tier: 'NM', level: 3, title: 'Bga', bpm: c.init });
            // A bmson STOP is in pulses; keep them apart so no two share a y.
            data.stopEvents = [...new Map(c.stops.map((s) => [s.y, s])).values()];
            // One BPM per EZ2 tick: two on one tick are the compat doc's "Two
            // BPMs at one tick" - the importer's pick is its qsort's, EZ2BMS
            // refuses them (lint bpm-same-tick).
            const tc = new TickConverter(240, data.stopEvents);
            data.bpmEvents = [
              ...new Map(c.bpms.map((b) => [tc.tick(b.y).tick, { y: b.y, bpm: b.bpm }])).values(),
            ];
            data.bga = {
              header: c.header.map((id) => ({ id, name: `clip${id}.mp4` })),
              bga: c.events.map((e) => ({ y: e.y, id: c.header[e.pick % c.header.length]! })),
              layer: [],
              poor: [],
            };
            const src = join(dir, 'src');
            mkdirSync(src);
            for (const id of c.header)
              writeFileSync(join(src, `clip${id}.mp4`), 'not a real movie');
            writeFileSync(join(src, 'chart.bmson'), serializeBmson(data));
            const game = join(dir, 'game');
            mkdirSync(join(game, 'system', 'StreetMix'), { recursive: true });
            writeFileSync(
              join(game, 'system', 'StreetMix', 'StreetMix.gds'),
              readFileSync(join(import.meta.dirname, 'fixtures', 'synthetic', 'StreetMix.gds')),
            );
            const songs = join(dir, 'songs');
            mkdirSync(songs);
            const imp = oracle<{ key: string; log: string[] }>([
              'bmson-import',
              src,
              game,
              songs,
              'bga',
            ]);
            const ini = readSongIni(new Uint8Array(readFileSync(join(songs, imp.key, 'song.ini'))));
            const ours = chartBga(data);
            expect(ours?.src ?? '', imp.log.join('\n')).toBe(ini.bga.file);
            if (ini.bga.startMs > 0) late++;
            const diff = Math.abs((ours?.startMs ?? 0) - ini.bga.startMs);
            if (exact) expect(ours?.startMs ?? 0).toBe(ini.bga.startMs);
            else expect(diff).toBeLessThanOrEqual(1);
          }),
        ),
        { numRuns: 40 },
      );
      // Most runs start the movie part-way in, through the tempo map.
      expect(late).toBeGreaterThan(20);
    }, 120_000);
});
