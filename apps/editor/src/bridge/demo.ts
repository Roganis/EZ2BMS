// A small synthetic song for the browser build and the end-to-end tests: two
// charts (StreetMix NM, 7StreetMix HD) over a drum kit and a sliced stem, a
// tempo change, holds of several kinds, a jacket and a banner the NM chart
// names (so its disc and eyecatch come from the charts, as EZ2PORT's importer
// takes them). Generated, not recorded: no audio bytes, only names the silent
// web audio pretends to load; the images are drawn in code (demo-art.ts).

import {
  ChartDoc,
  addChannels,
  chartBaseName,
  encodeUtf8,
  modeDef,
  newChart,
  placeNote,
  serializeBmson,
  setBpmAt,
  synthChart,
  synthSoundName,
  type ModeId,
  type Tier,
} from '@ez2bms/chart-core';
import { demoBanner, demoJacket, demoMovie } from './demo-art';

export const DEMO_DIR = '/demo/Neon Parade';

const SAMPLES = [
  'kick.wav',
  'snare.wav',
  'hat.wav',
  'clap.wav',
  'bass_a.wav',
  'bass_c.wav',
  'bass_e.wav',
  'lead_1.wav',
  'lead_2.wav',
  'lead_3.wav',
  'stem_pad.wav',
  'fx_riser.wav',
];

function chart(mode: ModeId, tier: Tier, level: number, dense: boolean): Uint8Array {
  const data = newChart({
    mode,
    tier,
    level,
    bpm: 150,
    title: 'Neon Parade',
    artist: 'EZ2BMS',
    genre: 'DEMO',
  });
  if (tier === 'NM') {
    data.info.eyecatchImage = 'jacket.bmp';
    data.info.titleImage = 'banner.bmp';
  }
  const doc = new ChartDoc(data);
  const ch = addChannels(doc, SAMPLES);
  const id = (name: string) => ch[SAMPLES.indexOf(name)]!.id;
  const R = 240;
  const keys = mode === '7k' ? [11, 12, 13, 14, 15] : [11, 12, 13, 14, 15];
  const put = (
    x: number,
    y: number,
    name: string,
    l = 0,
    extra: { kind?: number; c?: boolean } = {},
  ) => placeNote(doc, { x, y, ch: id(name), l, ...extra }, false);
  const measures = 24;
  for (let m = 0; m < measures; m++) {
    const y0 = m * 4 * R;
    // Backing: a pad stem sliced every measure (continuations after the first).
    put(0, y0, 'stem_pad.wav', 0, { c: m > 0 });
    for (let b = 0; b < 4; b++) {
      const y = y0 + b * R;
      put(10, y, 'kick.wav');
      if (b % 2 === 1) put(1, y, 'snare.wav');
      put(0, y + R / 2, 'hat.wav');
    }
    // A melodic run across the keys, denser on the harder chart.
    const steps = dense ? 16 : 8;
    for (let s = 0; s < steps; s++) {
      const y = y0 + (s * 4 * R) / steps;
      const lane = keys[(s * 3 + m) % keys.length]!;
      const name = `lead_${(s % 3) + 1}.wav`;
      if (s % (dense ? 8 : 4) === 3)
        put(lane, y, 'bass_' + 'ace'[m % 3] + '.wav', R, { kind: [0, 1, 2][m % 3] });
      else put(lane, y, name);
    }
    if (mode === '7k' && m % 4 === 3) {
      put(31, y0 + 2 * R, 'clap.wav');
      put(32, y0 + 3 * R, 'fx_riser.wav', R, { kind: 7 });
    }
  }
  setBpmAt(doc, 12 * 4 * R, 174);
  return encodeUtf8(serializeBmson(doc.data));
}

/** A chart that puts a staircase and a hold on every column of a mode. */
function laneTour(mode: ModeId): Uint8Array {
  const data = newChart({ mode, tier: 'NM', level: 3, bpm: 140, title: 'Lane Tour' });
  const doc = new ChartDoc(data);
  const [a] = addChannels(doc, ['kick.wav']);
  const cols = modeDef(mode).columns;
  cols.forEach((c, i) => {
    placeNote(doc, { x: c.x, y: i * 60, ch: a!.id }, false);
    placeNote(doc, { x: c.x, y: 960 + i * 120, ch: a!.id, l: 240 }, false);
  });
  placeNote(doc, { x: 0, y: 0, ch: a!.id }, false);
  return encodeUtf8(serializeBmson(doc.data));
}

const BENCH_SOUNDS = 1500;

/**
 * A 50k-note, 1500-sound chart for the benchmarks (?bench), its sounds named
 * in 60 kits so the rack and the workbench have groups to draw.
 */
function benchChart(): Uint8Array {
  return encodeUtf8(
    serializeBmson(
      synthChart({ mode: '14k', notes: 50_000, channels: BENCH_SOUNDS, names: 'grouped' }),
    ),
  );
}

export const TOUR_MODES: readonly ModeId[] = [
  '5k-only',
  'scratch',
  'ruby',
  '5k',
  '7k',
  '10k',
  '14k',
];

/** The demo song; with `modes`, one extra chart per EZ2PORT mode; with `bench`, a 50k-note chart. */
export function demoFiles(modes = false, bench = false): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set(`${DEMO_DIR}/streetmix1p-neonparade.bmson`, chart('5k', 'NM', 6, false));
  files.set(`${DEMO_DIR}/7streetmix1p-neonparade-hd.bmson`, chart('7k', 'HD', 12, true));
  if (bench) {
    files.set(`${DEMO_DIR}/spacemix1p-neonparade-ex.bmson`, benchChart());
    for (let i = 0; i < BENCH_SOUNDS; i++)
      files.set(`${DEMO_DIR}/${synthSoundName(i, 'grouped')}`, new Uint8Array(0));
  }
  if (modes) {
    for (const m of TOUR_MODES) {
      if (m === '5k' || m === '7k') continue;
      files.set(`${DEMO_DIR}/${chartBaseName(m, 'neonparade', 'NM')}.bmson`, laneTour(m));
    }
  }
  for (const s of SAMPLES) files.set(`${DEMO_DIR}/${s}`, new Uint8Array(0));
  files.set(`${DEMO_DIR}/jacket.bmp`, demoJacket());
  files.set(`${DEMO_DIR}/banner.bmp`, demoBanner());
  // A BGA to choose (the charts name none; the BGA page picks it).
  files.set(`${DEMO_DIR}/Neon Intro.MP4`, demoMovie());
  files.set(
    `${DEMO_DIR}/ez2bms.song.json`,
    // Classic mode off to start with, though the song slices a stem (tests switch it on).
    encodeUtf8(JSON.stringify({ key: 'neonparade', category: 48, classic: false }, null, 2) + '\n'),
  );
  return files;
}

/** How long the silent web audio says a sample is. */
export function demoSeconds(path: string): number {
  // The stem runs under the whole demo (24 measures at 150 BPM), sliced per measure.
  if (/stem/i.test(path)) return 40;
  if (/pad|bgm/i.test(path)) return 1.6;
  if (/bass|riser/i.test(path)) return 0.8;
  return 0.25;
}

/** A hit in the demo stem: when (seconds) and how loud (0..1). */
export interface DemoHit {
  sec: number;
  amp: number;
}

export interface DemoStem {
  seconds: number;
  bpm: number;
  hits: DemoHit[];
  /** A bar of silence, seconds [from, to). */
  silent: [number, number];
}

/**
 * What the demo stem "sounds like", for the browser build's waveforms and
 * onsets (it decodes nothing): a 150 BPM pattern, loud on the beats and
 * softer on the eighths between, over a quiet bed, with measure 9 silent.
 */
export function demoStem(path: string): DemoStem | undefined {
  if (!/stem/i.test(path)) return undefined;
  const seconds = demoSeconds(path);
  const beat = 60 / 150;
  const silent: [number, number] = [8 * 4 * beat, 9 * 4 * beat];
  const hits: DemoHit[] = [];
  for (let k = 0; (k * beat) / 2 < seconds; k++) {
    const sec = (k * beat) / 2;
    if (sec >= silent[0] && sec < silent[1]) continue;
    hits.push({ sec, amp: k % 2 === 0 ? 0.8 : 0.3 });
  }
  return { seconds, bpm: 150, hits, silent };
}

/** The demo stem's peak level over [t0, t1) seconds: the loudest hit's decay over the bed. */
export function demoStemLevel(stem: DemoStem, t0: number, t1: number): number {
  const bed = t0 < stem.silent[1] && t1 > stem.silent[0] && t0 >= stem.silent[0] ? 0 : 0.06;
  let level = bed;
  // Hits are 0.2 s apart and fade within half a second.
  let lo = 0;
  let hi = stem.hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stem.hits[mid]!.sec < t0 - 0.5) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < stem.hits.length && stem.hits[i]!.sec < t1; i++) {
    const h = stem.hits[i]!;
    const v = h.amp * Math.exp(-(Math.max(t0, h.sec) - h.sec) / 0.06);
    if (v > level) level = v;
  }
  return level;
}
