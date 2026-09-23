// The song preview EZ2BMS renders (crates/ez2bms-audio preview.rs, through
// its `preview` example) against the one EZ2PORT's importer writes
// (ez2_bmson_import's write_preview, through the oracle), for random songs:
// the same window by the importer's quarter rule, the same mix, fades and
// normalising - the same PCM.
//
// The importer sums its samples raw, where the engine - and so EZ2BMS's
// preview - plays a note at its velocity and pan (a centred note is a shade
// quieter on the left); these songs are mixed at unity to compare the rest.
// Nothing rings into the window from before it (the importer carries only
// sounds of 20 s or more across its start), and every note lands on a whole
// frame. Skipped when either binary is not built; CI builds both.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addChannels, placeNote } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import { modeDef } from '../src/modes/registry';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { engineEvents } from '../src/publish/playback';
import { defaultPreviewStart, PREVIEW_FADE_MS, PREVIEW_MS } from '../src/publish/preview';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const root = resolve(import.meta.dirname, '../../..');
const exe = process.platform === 'win32' ? 'preview.exe' : 'preview';
const PREVIEW = [
  process.env.EZ2BMS_PREVIEW,
  resolve(root, 'target/release/examples', exe),
  resolve(root, 'target/debug/examples', exe),
].find((p): p is string => !!p && existsSync(p));

const RATE = 44100;

/** 16-bit stereo noise, `frames` long, peaking near `amp`. */
function wav(frames: number, seed: number, amp: number): Buffer {
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 4, 40);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < frames * 2; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    buf.writeInt16LE(Math.round(((s / 2 ** 32) * 2 - 1) * amp), 44 + i * 2);
  }
  return buf;
}

function same(a: Uint8Array, b: Uint8Array, what: string) {
  if (Buffer.from(a).equals(Buffer.from(b))) return;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  expect.fail(`${what}: ${a.length} vs ${b.length} bytes, first difference at byte ${i}`);
}

const LANES = [0, 11, 12, 13, 14, 15];
const EIGHTH = 120; // pulses at resolution 240: 0.25 s at 120 BPM, 11025 frames

const song = fc.record({
  sounds: fc.array(fc.record({ seed: fc.integer(), amp: fc.constantFrom(1500, 9000, 30000) }), {
    minLength: 1,
    maxLength: 4,
  }),
  // Distinct (slot, lane) cells over about a minute.
  notes: fc.uniqueArray(
    fc.record({
      slot: fc.integer({ min: 0, max: 240 }),
      lane: fc.constantFrom(...LANES),
      sound: fc.nat(),
    }),
    { minLength: 2, maxLength: 160, selector: (n) => `${n.slot}/${n.lane}` },
  ),
});

describe.skipIf(!ORACLE || !PREVIEW)("the song preview against EZ2PORT's importer", () => {
  it('picks the same window and writes the same PCM', () => {
    fc.assert(
      fc.property(song, ({ sounds, notes }) =>
        withTmpDir((dir) => {
          const src = join(dir, 'src', 'pv');
          mkdirSync(src, { recursive: true });
          // 0.2 s samples: shorter than the eighth between two notes of a sound.
          const names = sounds.map((_, i) => `s${i}.wav`);
          sounds.forEach((s, i) => writeFileSync(join(src, names[i]!), wav(8820, s.seed, s.amp)));
          const data = newChart({ mode: '5k', tier: 'NM', level: 3, bpm: 120 });
          const doc = new ChartDoc(data);
          const chans = addChannels(doc, names);
          for (const n of notes)
            placeNote(
              doc,
              { x: n.lane, y: n.slot * EIGHTH, ch: chans[n.sound % chans.length]!.id },
              false,
            );
          writeFileSync(join(src, 'chart.bmson'), serializeBmson(doc.data));
          const game = join(dir, 'game');
          mkdirSync(join(game, 'system', 'StreetMix'), { recursive: true });
          writeFileSync(
            join(game, 'system', 'StreetMix', 'StreetMix.gds'),
            readFileSync(join(import.meta.dirname, 'fixtures', 'synthetic', 'StreetMix.gds')),
          );
          const songs = join(dir, 'songs');
          mkdirSync(songs);
          const imp = oracle<{ key: string; log: string[] }>(['bmson-import', src, game, songs]);
          const ssf = new Uint8Array(readFileSync(join(songs, imp.key, 'preview.ssf')));
          // .ssf: an 18-byte header (channels, rate, byte rate, block, bits, size), then PCM.
          const theirs = ssf.subarray(18);

          const reg = new KeysoundRegistry();
          const plan = compileChart(doc.data, {
            columns: modeDef('5k').columns,
            name: 'pv',
            keysounds: reg,
          });
          const events = engineEvents(plan, reg, (s) => names.indexOf(s)).map((e) => ({
            ...e,
            level: 0,
            pan: 0,
          }));
          const start = defaultPreviewStart(plan.events.map((e) => e.ms));
          const ours = new Uint8Array(
            execFileSync(PREVIEW!, [], {
              input: JSON.stringify({
                sources: names.map((n) => join(src, n)),
                events,
                from_ms: start,
                length_ms: PREVIEW_MS,
                fade_ms: PREVIEW_FADE_MS,
              }),
              maxBuffer: 64 << 20,
            }),
          );
          same(ours, theirs, `window from ${start} ms, ${notes.length} notes`);
        }),
      ),
      { numRuns: 12 },
    );
  }, 180_000);
});
