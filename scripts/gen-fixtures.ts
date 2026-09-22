// Synthetic songs to try EZ2BMS and EZ2PORT with, no game data needed: one
// song folder per EZ2PORT mode, with real (synthesized) WAV sounds - drums,
// a pitched keysound per lane, and an 8-bar pad stem sliced on every beat,
// which is the case where a click would show if slices did not join.
//
//   pnpm fixtures [out-dir]      (default: fixtures-out/)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addChannels,
  ChartDoc,
  chartBaseName,
  modeDef,
  modeNames,
  MODES,
  newChart,
  placeNote,
  serializeBmson,
  setBpmAt,
} from '../packages/chart-core/src/index';

const RATE = 44100;

function wav(samples: Float32Array): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!)) * 32767;
    v.setInt16(44 + i * 4, s, true);
    v.setInt16(46 + i * 4, s, true);
  }
  return new Uint8Array(buf);
}

let seed = 1;
const noise = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1;

function render(seconds: number, f: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = f(i / RATE, i);
  return out;
}

const SOUNDS: Record<string, Float32Array> = {
  'kick.wav': render(
    0.35,
    (t) => Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 0.9,
  ),
  'snare.wav': render(
    0.25,
    (t) => (noise() * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 18),
  ),
  'hat.wav': render(0.08, (t) => noise() * 0.35 * Math.exp(-t * 60)),
};
// One pitched keysound per lane position (a pentatonic run).
const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
NOTES.forEach((semi, i) => {
  const hz = 220 * 2 ** (semi / 12);
  SOUNDS[`key${String(i + 1).padStart(2, '0')}.wav`] = render(0.5, (t) => {
    const env = Math.min(1, t * 200) * Math.exp(-t * 5);
    return (Math.sin(2 * Math.PI * hz * t) * 0.5 + Math.sin(4 * Math.PI * hz * t) * 0.15) * env;
  });
});
// An 8-bar pad at 150 BPM (12.8 s): a chord that moves every bar.
const BAR = (60 / 150) * 4;
SOUNDS['pad_stem.wav'] = render(8 * BAR, (t) => {
  const bar = Math.floor(t / BAR);
  const root = 110 * 2 ** ([0, 5, 7, 3][bar % 4]! / 12);
  return (
    [1, 1.25, 1.5, 2].reduce((a, r) => a + Math.sin(2 * Math.PI * root * r * t) * 0.09, 0) *
    (0.6 + 0.4 * Math.sin(t * 3))
  );
});

const out = process.argv[2] ?? 'fixtures-out';
const R = 240;
for (const m of MODES.filter((x) => x.portPlayable)) {
  const key = `ez2bms${m.id.replace(/[^a-z0-9]/g, '')}`.slice(0, 15);
  const dir = join(out, `EZ2BMS ${m.portName} test`);
  mkdirSync(dir, { recursive: true });
  const data = newChart({
    mode: m.id,
    tier: 'NM',
    level: 3,
    bpm: 150,
    title: `EZ2BMS ${m.portName} test`,
    artist: 'EZ2BMS',
    genre: 'TEST',
  });
  const doc = new ChartDoc(data);
  const cols = modeDef(m.id).columns;
  const names = [
    'kick.wav',
    'snare.wav',
    'hat.wav',
    'pad_stem.wav',
    ...cols.map((_, i) => `key${String(i + 1).padStart(2, '0')}.wav`),
  ];
  const ch = new Map(addChannels(doc, names).map((c) => [c.name, c.id]));
  const id = (n: string) => ch.get(n)!;
  for (let bar = 0; bar < 8; bar++) {
    const y0 = bar * 4 * R;
    for (let b = 0; b < 4; b++) {
      const y = y0 + b * R;
      // The pad, sliced on every beat: continuations after the very first hit.
      placeNote(doc, { x: 0, y, ch: id('pad_stem.wav'), c: bar + b > 0 }, false);
      placeNote(doc, { x: 0, y, ch: id(b % 2 ? 'snare.wav' : 'kick.wav') }, false);
      placeNote(doc, { x: 0, y: y + R / 2, ch: id('hat.wav') }, false);
    }
    // A staircase over every lane, one per 8th, a hold every other bar.
    cols.forEach((c, i) => {
      const y = y0 + (((i * R) / 2) % (4 * R));
      placeNote(
        doc,
        {
          x: c.x,
          y,
          ch: id(`key${String(i + 1).padStart(2, '0')}.wav`),
          l: bar % 2 && i === 0 ? R : 0,
        },
        false,
      );
    });
  }
  setBpmAt(doc, 4 * 4 * R, 150); // a tempo event (same BPM) so the timing path is exercised
  writeFileSync(join(dir, `${chartBaseName(m.id, key, 'NM')}.bmson`), serializeBmson(doc.data));
  writeFileSync(join(dir, 'ez2bms.song.json'), JSON.stringify({ key }, null, 2) + '\n');
  for (const n of names) writeFileSync(join(dir, n), wav(SOUNDS[n]!));
  console.log(`${modeNames(m.id).label.padEnd(12)} -> ${dir}`);
}
