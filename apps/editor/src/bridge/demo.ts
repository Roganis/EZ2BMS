// A small synthetic song for the browser build and the end-to-end tests: two
// charts (StreetMix NM, 7StreetMix HD) over a drum kit and a sliced stem, a
// tempo change, holds of several kinds. Generated, not recorded: no audio
// bytes, only names the silent web audio pretends to load.

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
  type ModeId,
  type Tier,
} from '@ez2bms/chart-core';

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

/** A 50k-note, 1500-sound chart, for the renderer benchmark (?bench). */
function benchChart(): Uint8Array {
  return encodeUtf8(serializeBmson(synthChart({ mode: '14k', notes: 50_000, channels: 1500 })));
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
  if (bench) files.set(`${DEMO_DIR}/spacemix1p-neonparade-ex.bmson`, benchChart());
  if (modes) {
    for (const m of TOUR_MODES) {
      if (m === '5k' || m === '7k') continue;
      files.set(`${DEMO_DIR}/${chartBaseName(m, 'neonparade', 'NM')}.bmson`, laneTour(m));
    }
  }
  for (const s of SAMPLES) files.set(`${DEMO_DIR}/${s}`, new Uint8Array(0));
  files.set(
    `${DEMO_DIR}/ez2bms.song.json`,
    encodeUtf8(JSON.stringify({ key: 'neonparade', category: 0 }, null, 2) + '\n'),
  );
  return files;
}

/** How long the silent web audio says a sample is. */
export function demoSeconds(path: string): number {
  if (/stem|pad|bgm/i.test(path)) return 1.6;
  if (/bass|riser/i.test(path)) return 0.8;
  return 0.25;
}
