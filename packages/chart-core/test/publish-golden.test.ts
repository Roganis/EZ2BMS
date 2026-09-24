// EZ2PORT publish bytes, pinned. The cabinet profile (M6) reworks the
// compiler's walk and its track allocator; what EZ2PORT receives must not
// move by a byte. These hashes were recorded from the compiler BEFORE that
// work, over seeded random charts that carry everything the cabinet reads
// and a publish must ignore (x_track pins, x_len, kept records, an x_ez
// header), plus slices, holds, stops, tempo changes, off-mode lanes, `up`
// notes, and sample lengths that make backing tracks fill up and choke.
// GOLDEN_UPDATE=1 rewrites them - only ever for a change meant to move
// publish output, said so in the commit.
//
// M8 moved it once, on purpose: a package now carries scroll changes,
// including the type-6 records an import kept (these charts have one). The
// hashes from before are kept as they were, and the same charts with those
// records taken out must still compile to them: nothing else moved.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fnv1a64Hex } from '../src/ez2data/abm';
import { writeEzff } from '../src/io/ez/ezff';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec } from '../src/model/types';
import type { ModeId } from '../src/modes/ids';
import { modeDef } from '../src/modes/registry';
import { compileChart, type SampleLookup } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { eziText } from '../src/publish/text';

const FILE = resolve(import.meta.dirname, 'fixtures/synthetic/publish-golden.json');
/** Recorded before M8; never rewritten. */
const BEFORE_SCROLL = resolve(
  import.meta.dirname,
  'fixtures/synthetic/publish-golden-noscroll.json',
);
const MODES: ModeId[] = ['5k-only', 'scratch', 'ruby', '5k', '7k', '10k', '14k'];

/** mulberry32: a small seeded PRNG, so the charts are the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function goldenChart(seed: number): { chart: ChartData; mode: ModeId; samples: SampleLookup } {
  const r = rng(seed);
  // Seeds past 40 are dense: many long or endless background sounds, some on
  // one tick, so the backing tracks fill up and sounds have to choke.
  const dense = seed > 40;
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const mode = pick(MODES);
  const res = pick([240, 480, 960, 192]);
  const chart = newChart({
    mode,
    tier: 'NM',
    bpm: r() < 0.3 ? 120 + int(0, 900) / 7 : int(80, 220),
  });
  chart.info.resolution = res;
  const span = res * 4 * int(4, 24);
  const grid = () => pick([res / 4, res / 12, res / 48, res / 3, 1]);
  const at = () => Math.floor((r() * span) / grid()) * grid();
  for (let i = int(0, 5); i > 0; i--)
    chart.bpmEvents.push({ y: r() < 0.15 ? 0 : at(), bpm: pick([90, 150, 174.5, 1200, 0, 33.3]) });
  for (let i = int(0, 2); i > 0; i--)
    chart.stopEvents.push({ y: at(), duration: pick([res, res / 2, 7]) });
  const nch = int(2, 14);
  for (let i = 1; i <= nch; i++)
    chart.channels.push({
      id: i,
      name: pick(['', 'stems/']) + `s${i}` + pick(['.wav', '.ogg', '']),
    });
  const cols = modeDef(mode).columns;
  const lengths = new Map(
    chart.channels.map((c) => [
      c.name,
      r() < (dense ? 0.3 : 0.7) ? int(0, 3) * (dense ? 400000 : 20000) + int(1, 99) : -1,
    ]),
  );
  let id = 1;
  for (let i = dense ? int(150, 400) : int(10, 160); i > 0; i--) {
    const kind = dense ? r() * 0.5 + 0.45 : r();
    const x = kind < 0.45 ? pick(cols).x : kind < 0.9 ? 0 : pick([2, 20, 33, 34, 99]);
    const y = dense && r() < 0.2 ? res * 4 * int(0, 3) : at();
    const n: NoteRec = { id: id++, ch: int(1, nch), x, y, l: 0, c: r() < 0.25 };
    if (x && x < 40 && r() < 0.2) n.l = grid() * int(1, 8);
    if (r() < 0.2) n.vel = int(0, 127);
    if (r() < 0.2) n.pan = int(0, 127);
    if (r() < 0.1) n.kind = int(1, 3);
    if (r() < 0.05) n.up = true;
    if (!x && r() < 0.5) n.extra = { x_track: int(0, 70) };
    if (r() < 0.1) n.extra = { ...n.extra, x_len: int(0, 20) };
    chart.notes.push(n);
  }
  if (r() < 0.5) {
    chart.extra.x_ez = {
      file: 'x.ez',
      version: 8,
      name: '곡',
      name2: 'b',
      bpm: 150,
      bpm2: 150,
      total_ticks: 99999,
      ticks_per_measure: 192,
      tracks: 23,
      measure_scale: 1,
    };
    chart.extra.x_ez_records = [
      { track: 5, y: at(), type: 6, raw: [1065353216, 0], scroll: 1 },
      { track: 3, y: at(), type: 2, value: 90 },
    ];
  }
  const samples: SampleLookup = (src) => {
    const f = lengths.get(src);
    return f === undefined || f < 0 ? undefined : { frames: f };
  };
  return { chart, mode, samples };
}

function hashOf(seed: number, noScroll = false): string {
  const { chart, mode, samples } = goldenChart(seed);
  if (noScroll && Array.isArray(chart.extra.x_ez_records))
    chart.extra.x_ez_records = chart.extra.x_ez_records.filter(
      (k) => (k as { type: number }).type !== 6,
    );
  const reg = new KeysoundRegistry();
  const plan = compileChart(chart, {
    columns: modeDef(mode).columns,
    name: 'golden',
    keysounds: reg,
    samples,
  });
  const ez = fnv1a64Hex(writeEzff(plan.ezff));
  const round = (v: number | null) => (v === null ? null : Math.round(v * 1e6) / 1e6);
  const rest = JSON.stringify({
    ezi: eziText(
      plan.keysoundSlots.map((k) => reg.defs[k]!.name),
      '\r\n',
    ),
    defs: reg.defs,
    events: plan.events.map((e) => ({
      ...e,
      ms: round(e.ms),
      originMs: round(e.originMs),
      untilMs: round(e.untilMs),
    })),
    stats: plan.stats,
    endMs: round(plan.endMs),
  });
  return `${ez} ${fnv1a64Hex(new TextEncoder().encode(rest))}`;
}

describe('EZ2PORT publish output is pinned', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
  it('50 seeded charts compile to the recorded bytes', () => {
    const now = Object.fromEntries(seeds.map((s) => [s, hashOf(s)]));
    if (process.env.GOLDEN_UPDATE) {
      writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
      return;
    }
    expect(existsSync(FILE), 'the recorded hashes (GOLDEN_UPDATE=1 records them)').toBe(true);
    expect(now).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
  });

  it('without scroll changes, the bytes from before EZ2BMS published them', () => {
    const now = Object.fromEntries(seeds.map((s) => [s, hashOf(s, true)]));
    expect(now).toEqual(JSON.parse(readFileSync(BEFORE_SCROLL, 'utf8')));
  });
});
