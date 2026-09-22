import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { addChannels, placeNote, setBpmAt, setStopAt } from '../src/edit/commands';
import { serializeBmson } from '../src/io/bmson/serialize';
import { readEzff, EZ_NOTE } from '../src/io/ez/ezff';
import { newChart } from '../src/model/defaults';
import type { ChartData } from '../src/model/types';
import { modeDef } from '../src/modes/registry';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry, OUT_RATE } from '../src/publish/keysounds';
import { compileSong, PublishError } from '../src/publish/package';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

/** A 5K STANDARD chart touching every publishing rule. */
function sampleChart(opts: { stops?: boolean; up?: boolean } = {}): ChartData {
  const data = newChart({ mode: '5k', tier: 'HD', title: 'Sample', level: 7, bpm: 150 });
  data.info.judgementDeltas = { KOOL: 7, COOL: 30, GOOD: 50, MISS: 80 };
  const doc = new ChartDoc(data);
  const [kick, piano, stem] = addChannels(doc, ['kick.wav', 'keys/piano 1.wav', 'stem.wav']);
  const R = 240;
  // lanes: turntable, keys, pedal
  [1, 11, 12, 13, 14, 15, 10].forEach((x, i) =>
    placeNote(doc, { x, y: i * R, ch: kick!.id }, false),
  );
  // a hold with a kind, velocity and pan
  placeNote(doc, { x: 13, y: 8 * R, l: 2 * R, ch: piano!.id, kind: 1, vel: 100, pan: 20 }, false);
  // background
  placeNote(doc, { x: 0, y: 0, ch: piano!.id }, false);
  placeNote(doc, { x: 0, y: 0, ch: kick!.id }, false);
  // a sliced stem: fresh + two continuations, one keyed onto a lane
  placeNote(doc, { x: 0, y: 12 * R, ch: stem!.id }, false);
  placeNote(doc, { x: 12, y: 13 * R, ch: stem!.id, c: true }, false);
  placeNote(doc, { x: 0, y: 14 * R, ch: stem!.id, c: true }, false);
  // an effector lane 5K does not have -> background
  placeNote(doc, { x: 31, y: 15 * R, ch: kick!.id }, false);
  setBpmAt(doc, 16 * R, 180);
  if (opts.stops) setStopAt(doc, 10 * R - 60, R);
  if (opts.up) {
    const id = placeNote(doc, { x: 15, y: 20 * R, l: R, ch: piano!.id }, false)!;
    doc.transact('up', (tx) => tx.patchNotes([{ id, patch: { up: true } }]));
  }
  return doc.data;
}

describe('publish plan', () => {
  it('routes lanes to the mode tracks and everything else to backing', () => {
    const reg = new KeysoundRegistry();
    const plan = compileChart(sampleChart(), {
      columns: modeDef('5k').columns,
      name: 'song',
      keysounds: reg,
    });
    const lane = plan.events.filter((e) => e.lane);
    // 7 taps + the hold + the keyed continuation
    expect(lane).toHaveLength(9);
    expect(new Set(lane.map((e) => e.track))).toEqual(new Set([10, 3, 4, 5, 6, 7, 11]));
    expect(plan.stats.offMode).toBe(1);
    expect(plan.stats.backing).toBe(5);
    for (const e of plan.events.filter((e) => !e.lane)) {
      expect([0, 21, 3, 4, 5, 6, 7, 10, 11]).not.toContain(e.track);
    }
  });

  it('slices a continuation chain into contiguous frame ranges', () => {
    const reg = new KeysoundRegistry();
    const plan = compileChart(sampleChart(), {
      columns: modeDef('5k').columns,
      name: 'song',
      keysounds: reg,
    });
    const stem = plan.events
      .filter((e) => reg.defs[e.keysound]!.src === 'stem.wav')
      .map((e) => reg.defs[e.keysound]!);
    expect(stem.map((d) => d.startFrame)).toEqual([0, OUT_RATE * 0.4, OUT_RATE * 0.8]); // a beat at 150 BPM = 0.4 s
    expect(stem[0]!.endFrame).toBe(stem[1]!.startFrame);
    expect(stem[1]!.endFrame).toBe(stem[2]!.startFrame);
    expect(stem[2]!.endFrame).toBeNull(); // the last slice plays out
    expect(stem.map((d) => d.name)).toEqual(['stem_0_400', 'stem_400_800', 'stem_800_end']);
  });

  it('keeps chained slices contiguous for any tempo and spacing (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 60, max: 400, noNaN: true }),
        fc.array(fc.integer({ min: 1, max: 96 }), { minLength: 1, maxLength: 12 }),
        (bpm, gaps) => {
          const data = newChart({ mode: '5k', tier: 'NM', bpm });
          data.channels.push({ id: 1, name: 'a.wav' });
          let y = 0;
          data.notes.push({ id: 1, ch: 1, x: 0, y: 0, l: 0, c: false });
          gaps.forEach((g, i) => {
            y += g * 5;
            data.notes.push({ id: i + 2, ch: 1, x: 0, y, l: 0, c: true });
          });
          const reg = new KeysoundRegistry();
          const plan = compileChart(data, {
            columns: modeDef('5k').columns,
            name: 's',
            keysounds: reg,
          });
          const defs = plan.events.map((e) => reg.defs[e.keysound]!);
          expect(defs[0]!.startFrame).toBe(0);
          for (let i = 1; i < defs.length; i++)
            expect(defs[i]!.startFrame).toBe(defs[i - 1]!.endFrame);
          // Playback sees the same chain as times: one origin, each slice
          // ending where the next begins, the last playing out.
          const ev = plan.events;
          for (let i = 0; i < ev.length; i++) {
            expect(ev[i]!.originMs).toBe(ev[0]!.ms);
            expect(ev[i]!.untilMs).toBe(i + 1 < ev.length ? ev[i + 1]!.ms : null);
          }
        },
      ),
    );
  });

  it('keeps a hold across a STOP whole and keeps `up` notes', () => {
    const reg = new KeysoundRegistry();
    const plan = compileChart(sampleChart({ stops: true, up: true }), {
      columns: modeDef('5k').columns,
      name: 'song',
      keysounds: reg,
    });
    const hold = plan.events.find((e) => e.holdTicks > 0 && e.kind === 1)!;
    expect(hold.holdTicks).toBe(2 * 48 + 48); // two beats + the one-beat stop inside it
    expect(plan.stats.droppedUp).toBe(1);
    expect(plan.events.some((e) => e.x === 15 && e.holdTicks === 48)).toBe(true);
  });

  it('refuses what EZ2PORT cannot load', () => {
    const c = { data: sampleChart(), mode: '5k' as const, tier: 'HD' as const };
    expect(() => compileSong({ key: 'bad-key', title: '', artist: '', genre: '' }, [c])).toThrow(
      PublishError,
    );
    expect(() => compileSong({ key: 'ok', title: '', artist: '', genre: '' }, [c, c])).toThrow(
      /two charts/,
    );
    expect(() =>
      compileSong({ key: 'ok', title: '', artist: '', genre: '' }, [{ ...c, mode: 'andromeda' }]),
    ).toThrow(/cannot be published/);
  });
});

function writePackage(
  dir: string,
  meta: Parameters<typeof compileSong>[0],
  charts: Parameters<typeof compileSong>[1],
) {
  const plan = compileSong(meta, charts);
  const out = join(dir, meta.key);
  mkdirSync(out, { recursive: true });
  for (const f of plan.files) writeFileSync(join(out, f.path), f.bytes);
  return { plan, out };
}

describe.skipIf(!ORACLE)('published packages against EZ2PORT (oracle)', () => {
  it('the engine reads every file as planned and judges every lane note', () => {
    withTmpDir((dir) => {
      const { plan, out } = writePackage(
        dir,
        { key: 'sample', title: 'Sample; Song', artist: 'A', genre: 'G', category: 48 },
        [{ data: sampleChart({ stops: true }), mode: '5k', tier: 'HD' }],
      );
      const pc = plan.charts[0]!;
      const stem = join(out, pc.stem);
      expect(pc.stem).toBe('streetmix1p-sample-hd');

      const ezi = oracle<{ entries: { note: number; name: string }[] }>(['ezi', `${stem}.ezi`]);
      expect(ezi.entries.map((e) => e.name)).toEqual(
        pc.plan.keysoundSlots.map((i) => `${plan.registry.defs[i]!.name}.wav`),
      );

      const chart = oracle<{
        tracks: {
          records: {
            tick: number;
            type: number;
            key?: number;
            vel?: number;
            pan?: number;
            kind?: number;
            length?: number;
            ms: number;
          }[];
        }[];
      }>(['chart', `${stem}.ez`]);
      for (const e of pc.plan.events) {
        const recs = chart.tracks[e.track]!.records.filter(
          (r) => r.type === EZ_NOTE && r.tick === e.tick,
        );
        const slotName = ezi.entries[(recs.find(() => true)?.key ?? 0) - 1]?.name;
        expect(recs.length, `track ${e.track} tick ${e.tick}`).toBe(1);
        expect(slotName).toBe(`${plan.registry.defs[e.keysound]!.name}.wav`);
        expect(recs[0]!.ms).toBe(e.ms); // the editor's clock is the engine's
        expect([recs[0]!.vel, recs[0]!.pan, recs[0]!.kind]).toEqual([e.vel, e.pan, e.kind]);
        expect(recs[0]!.length).toBe(e.holdTicks ? e.holdTicks + 6 : 0);
      }

      const ini = oracle<{
        raw: { level: number; kool: number; cool: number; good: number; miss: number };
        effective: { kool: number };
      }>(['songini', `${stem}.ini`, 'StreetMix']);
      expect(ini.raw).toMatchObject({ level: 7, kool: 7, cool: 30, good: 50, miss: 80 });
      expect(ini.effective.kool).toBe(10);

      const sim = oracle<{
        total_notes: number;
        backing: number;
        counts: number[];
        score: number;
        max: number;
      }>(['judge-sim', `${stem}.ez`, `${stem}.ini`, 'StreetMix', '0', '0', '1']);
      expect(sim.backing).toBe(pc.plan.stats.backing);
      expect(sim.counts[1]).toBe(sim.total_notes); // every lane note KOOL at zero offset
      expect(sim.score).toBe(sim.max);

      const songIni = readFileSync(join(out, 'song.ini'), 'utf8');
      expect(songIni).toContain('Title = Sample, Song'); // `;` would start a comment
      expect(songIni).toContain('StreetMix.HD = 7 ; streetmix1p-sample-hd.ez');
      expect(songIni).toContain('Category = 48');
    });
  });

  it('agrees with the port importer on lanes, keysounds and background', () => {
    withTmpDir((dir) => {
      // The same song through EZ2PORT's own bmson importer...
      const data = sampleChart();
      const src = join(dir, 'src', 'psong');
      mkdirSync(join(src, 'keys'), { recursive: true });
      const wav = (seconds: number, seed: number) => {
        const frames = Math.round(OUT_RATE * seconds);
        const buf = Buffer.alloc(44 + frames * 4);
        buf.write('RIFF', 0);
        buf.writeUInt32LE(36 + frames * 4, 4);
        buf.write('WAVEfmt ', 8);
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(2, 22);
        buf.writeUInt32LE(OUT_RATE, 24);
        buf.writeUInt32LE(OUT_RATE * 4, 28);
        buf.writeUInt16LE(4, 32);
        buf.writeUInt16LE(16, 34);
        buf.write('data', 36);
        buf.writeUInt32LE(frames * 4, 40);
        for (let i = 0; i < frames * 2; i++)
          buf.writeInt16LE(((i * seed) % 20000) - 10000, 44 + i * 2);
        return buf;
      };
      writeFileSync(join(src, 'kick.wav'), wav(0.2, 7));
      writeFileSync(join(src, 'keys', 'piano 1.wav'), wav(0.5, 11));
      writeFileSync(join(src, 'stem.wav'), wav(2, 13));
      writeFileSync(join(src, 'chart.bmson'), serializeBmson(data));
      const game = join(dir, 'game');
      mkdirSync(join(game, 'system', 'StreetMix'), { recursive: true });
      writeFileSync(
        join(game, 'system', 'StreetMix', 'StreetMix.gds'),
        readFileSync(join(import.meta.dirname, 'fixtures', 'synthetic', 'StreetMix.gds')),
      );
      const songs = join(dir, 'songs');
      mkdirSync(songs);
      const imp = oracle<{ rc: number; key: string; log: string[] }>([
        'bmson-import',
        src,
        game,
        songs,
      ]);
      expect(imp.key, imp.log.join('\n')).toBe('psong');
      const port = readdirSync(join(songs, 'psong'));
      const portEz = port.find((f) => f.endsWith('.ez'))!;
      expect(portEz).toBe('streetmix1p-psong-hd.ez');
      const theirs = readEzff(new Uint8Array(readFileSync(join(songs, 'psong', portEz))));
      const theirNames = readFileSync(
        join(songs, 'psong', portEz.replace(/\.ez$/, '.ezi')),
        'latin1',
      )
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(' ').slice(2).join(' '));

      // ...and through EZ2BMS.
      const { plan } = writePackage(
        join(dir, 'ours'),
        { key: 'psong', title: '', artist: '', genre: '' },
        [{ data, mode: '5k', tier: 'HD' }],
      );
      const ours = plan.charts[0]!.plan;
      const ourNames = ours.keysoundSlots.map((i) => `${plan.registry.defs[i]!.name}.wav`);

      const records = (ez: typeof theirs, names: string[], lanes: Set<number>) => {
        const lane: string[] = [];
        const back: string[] = [];
        ez.tracks.forEach((t, ti) =>
          t.records
            .filter((r) => r.type === EZ_NOTE)
            .forEach((r) => {
              const s = `${r.tick} ${names[r.key! - 1]} ${r.length}`;
              if (lanes.has(ti)) lane.push(`${ti} ${s}`);
              else back.push(s);
            }),
        );
        return { lane: lane.sort(), back: back.sort() };
      };
      const lanes = new Set(modeDef('5k').columns.map((c) => c.track));
      const t = records(theirs, theirNames, lanes);
      const o = records(ours.ezff, ourNames, lanes);
      // Identical lane notes (track, tick, keysound, length) - except the
      // velocity/pan/kind the importer cannot carry, which EZ2BMS does.
      expect(o.lane).toEqual(t.lane);
      // Identical background sounds; which backing track each uses may differ
      // (EZ2BMS's allocator is voice-aware).
      expect(o.back).toEqual(t.back);
      const hold = ours.ezff.tracks[5]!.records.find(
        (r) => r.type === EZ_NOTE && (r.length ?? 0) > 6,
      )!;
      expect([hold.vel, hold.pan, hold.kind]).toEqual([100, 20, 1]);
    });
  });
});
