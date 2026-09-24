// Legacy bmson against EZ2PORT's own importer (ez2/bmson.c): a 0.21 file,
// upgraded and renumbered by EZ2BMS, publishes to what the port makes of the
// same notes - and a spec-numbered beat-10k file publishes to what the port
// makes of it once its 2P side is written EZ2's way, which is exactly the
// deviation docs/ez2port-compat.md describes.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { synthGds } from '../src/dev/synthgame';
import { openChart } from '../src/io/bmson/open';
import { upgradeBmson021 } from '../src/io/bmson/v021';
import { readEzff, EZ_NOTE, type EzffChart } from '../src/io/ez/ezff';
import type { ModeId } from '../src/modes/ids';
import { modeNames } from '../src/modes/ids';
import { modeDef } from '../src/modes/registry';
import { OUT_RATE } from '../src/publish/keysounds';
import { compileSong } from '../src/publish/package';
import { v021 } from './legacy-fixtures';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

function wav(seconds: number) {
  const frames = Math.round(OUT_RATE * seconds);
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(OUT_RATE, 24);
  buf.writeUInt32LE(OUT_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buf.writeInt16LE(((i * 37) % 20000) - 10000, 44 + i * 2);
  return buf;
}

/** Note records as `track tick sound length` (lanes) and `tick sound` (background), sorted. */
function records(ez: EzffChart, names: string[], lanes: Set<number>) {
  const lane: string[] = [];
  const back: string[] = [];
  ez.tracks.forEach((t, ti) =>
    t.records
      .filter((r) => r.type === EZ_NOTE)
      .forEach((r) => {
        if (lanes.has(ti)) lane.push(`${ti} ${r.tick} ${names[r.key! - 1]} ${r.length}`);
        else back.push(`${r.tick} ${names[r.key! - 1]}`);
      }),
  );
  return { lane: lane.sort(), back: back.sort() };
}

/** The port's package for a bmson text, and ours for the chart EZ2BMS opens from `ours`. */
function both(dir: string, theirText: string, ours: string, mode: ModeId, sounds: string[]) {
  const src = join(dir, 'src', 'legacy');
  mkdirSync(src, { recursive: true });
  for (const s of sounds) writeFileSync(join(src, s), wav(0.3));
  writeFileSync(join(src, 'chart.bmson'), theirText);
  const port = modeNames(mode).portName;
  const game = join(dir, 'game');
  mkdirSync(join(game, 'system', port), { recursive: true });
  writeFileSync(join(game, 'system', port, `${port}.gds`), synthGds(mode));
  mkdirSync(join(dir, 'songs'));
  const imp = oracle<{ key: string; log: string[] }>([
    'bmson-import',
    src,
    game,
    join(dir, 'songs'),
  ]);
  expect(imp.key, imp.log.join('\n')).toBe('legacy');
  const pdir = join(dir, 'songs', 'legacy');
  const portEz = readdirSync(pdir).find((f) => f.endsWith('.ez'))!;
  const theirs = readEzff(new Uint8Array(readFileSync(join(pdir, portEz))));
  const theirNames = readFileSync(join(pdir, portEz.replace(/\.ez$/, '.ezi')), 'latin1')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' ').slice(2).join(' ').trim());

  const o = openChart('chart.bmson', ours);
  expect(o.mode).toBe(mode);
  const plan = compileSong({ key: 'legacy', title: '', artist: '', genre: '' }, [
    { data: o.chart, mode, tier: o.tier },
  ]);
  const pc = plan.charts[0]!.plan;
  const ourNames = pc.keysoundSlots.map((i) => `${plan.registry.defs[i]!.name}.wav`);
  const lanes = new Set(modeDef(mode).columns.map((c) => c.track));
  return { theirs: records(theirs, theirNames, lanes), ours: records(pc.ezff, ourNames, lanes) };
}

describe.skipIf(!ORACLE)('legacy bmson against the port importer (oracle)', () => {
  it('a bmson 0.21 file publishes as the port imports it once written as 1.0', () => {
    const doc = v021({
      soundChannel: [
        {
          name: 'a.wav',
          notes: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x, i) => ({ x, y: i * 120, l: 0, c: false })),
        },
        {
          name: 'b.wav',
          notes: [
            { x: 3, y: 1440, l: 480, c: false },
            { x: 0, y: 0, l: 0, c: false },
          ],
        },
      ],
    });
    withTmpDir((dir) => {
      const r = both(dir, JSON.stringify(upgradeBmson021(doc)), JSON.stringify(doc), '7k', [
        'a.wav',
        'b.wav',
      ]);
      expect(r.ours.lane.length).toBe(10);
      expect(r.ours).toEqual(r.theirs);
    });
  });

  it("a spec-numbered beat-10k file publishes as the port imports it with the 2P side in EZ2's numbering", () => {
    const spec = [1, 3, 5, 8, 9, 10, 11, 12, 13, 16];
    const ez2 = spec.map((x) => (x >= 9 && x <= 13 ? x + 2 : x));
    const doc = (xs: number[]) =>
      JSON.stringify({
        version: '1.0.0',
        info: { title: 'T', mode_hint: 'beat-10k', init_bpm: 140, resolution: 240, level: 3 },
        sound_channels: [
          { name: 'k.wav', notes: xs.map((x, i) => ({ x, y: i * 240, l: 0, c: false })) },
        ],
      });
    withTmpDir((dir) => {
      const r = both(dir, doc(ez2), doc(spec), '10k', ['k.wav']);
      expect(r.ours.lane.length).toBe(spec.length);
      expect(r.ours).toEqual(r.theirs);
    });
  });
});
