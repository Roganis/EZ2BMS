import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BmsonError,
  chartMode,
  chartTier,
  newChart,
  parseBmson,
  portImporterMode,
  portImporterTier,
  remapLegacyChart,
  serializeBmson,
  type ChartData,
  type ChartInfo,
} from '../src/index';

const fixture = (p: string) => readFileSync(resolve(import.meta.dirname, 'fixtures', p));

/** Strip runtime ids so two parses of the same text compare equal. */
function shape(c: ChartData) {
  return JSON.parse(serializeBmson(c)) as unknown;
}

describe('bmson round trip', () => {
  it('reads the BmsTWO EZ2 template and keeps every member', () => {
    const bytes = fixture('bmstwo/EZ2_TEMPLATE.bmson');
    const { chart, warnings } = parseBmson(bytes);
    expect(warnings).toEqual([]);
    expect(chart.info.modeHint).toBe('ez2-5k');
    expect(chart.info.judgementDeltas).toEqual({ KOOL: 6, COOL: 24, GOOD: 36, MISS: 72 });
    expect(chart.info.lifeDeltas).toEqual({ COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 });
    expect(chart.lines).toEqual([{ y: 0 }]);
    // Same members and values as the original, even though the layout differs.
    expect(JSON.parse(serializeBmson(chart))).toEqual(JSON.parse(bytes.toString('utf8')));
  });

  it('is byte-stable once written by EZ2BMS', () => {
    const once = serializeBmson(parseBmson(fixture('bmstwo/EZ2_TEMPLATE.bmson')).chart);
    const twice = serializeBmson(parseBmson(once).chart);
    expect(twice).toBe(once);
    expect(once.endsWith('\n')).toBe(true);
  });

  it('keeps unknown members at every level', () => {
    const doc = {
      version: '1.0.0',
      mine_channels: [{ name: 'boom.wav', notes: [{ x: 11, y: 0, damage: 5 }] }],
      x_future: { a: 1 },
      info: { title: 'T', resolution: 240, init_bpm: 150, x_custom: [1, 2] },
      lines: [{ y: 0, x_mark: 'intro' }],
      bpm_events: [{ y: 960, bpm: 180, x_bpm: true }],
      stop_events: [{ y: 480, duration: 240, x_s: 1 }],
      sound_channels: [
        {
          name: 'a.wav',
          x_color: '#ff0000',
          x_group: 'drums',
          notes: [{ x: 11, y: 0, l: 0, c: false, x_vel: 100, x_pan: 20, x_kind: 1, x_note: 'hi' }],
        },
      ],
      bga: {
        bga_header: [{ id: 1, name: 'bg.mp4', x_h: 1 }],
        bga_events: [{ y: 0, id: 1, x_e: 1 }],
        layer_events: [],
        poor_events: [],
        x_bga: 'k',
      },
    };
    const { chart, warnings } = parseBmson(JSON.stringify(doc));
    expect(warnings).toEqual([]);
    const n = chart.notes[0]!;
    expect([n.vel, n.pan, n.kind]).toEqual([100, 20, 1]);
    expect(chart.channels[0]!.color).toBe('#ff0000');
    expect(JSON.parse(serializeBmson(chart))).toEqual(doc);
  });

  it('keeps wrongly typed known members verbatim and reports them', () => {
    const doc = {
      version: '1.0.0',
      info: { level: '12', judgement_deltas: { KOOL: 6, COOL: 24, GOOD: 36, MISS: 72, X: 1 } },
      sound_channels: [{ name: 'a.wav', notes: [{ x: 11, y: 0, l: 0, c: 'yes', x_vel: 300 }] }],
    };
    const { chart, warnings } = parseBmson(JSON.stringify(doc));
    expect(chart.info.level).toBeUndefined();
    expect(chart.info.judgementDeltas).toBeUndefined();
    expect(warnings.map((w) => w.path)).toEqual([
      '$.info.level',
      '$.info.judgement_deltas',
      '$.sound_channels[0].notes[0].c',
      '$.sound_channels[0].notes[0].x_vel',
    ]);
    const back = JSON.parse(serializeBmson(chart)) as typeof doc;
    expect(back.info).toEqual(doc.info);
    // c is required, so a wrongly typed one falls back to its default.
    expect(back.sound_channels[0]!.notes[0]).toEqual({ x: 11, y: 0, l: 0, c: false, x_vel: 300 });
  });

  it('strips a BOM when reading and never writes one', () => {
    const text = String.fromCharCode(0xfeff) + JSON.stringify({ version: '1.0.0', info: {} });
    const bytes = new TextEncoder().encode(text);
    const r = parseBmson(bytes);
    expect(r.hadBom).toBe(true);
    expect(serializeBmson(r.chart).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('refuses what is not bmson 1.0', () => {
    expect(() => parseBmson('[]')).toThrow(BmsonError);
    expect(() => parseBmson('{"info":{}}')).toThrow(/0\.21/);
    expect(() => parseBmson('{nope')).toThrow(/not JSON/);
    expect(() => parseBmson(new Uint8Array([0x7b, 0xff, 0x7d]))).toThrow(/UTF-8/);
  });

  it('sorts notes by channel then (y, x) and refuses NaN', () => {
    const c = newChart({ mode: '5k', tier: 'NM' });
    c.channels.push({ id: 1, name: 'a.wav' }, { id: 2, name: 'b.wav' });
    c.notes.push(
      { id: 1, ch: 2, x: 11, y: 0, l: 0, c: false },
      { id: 2, ch: 1, x: 12, y: 480, l: 0, c: false },
      { id: 3, ch: 1, x: 11, y: 480, l: 0, c: false },
      { id: 4, ch: 1, x: 13, y: 0, l: 0, c: false },
    );
    const out = JSON.parse(serializeBmson(c)) as {
      sound_channels: { notes: { x: number; y: number }[] }[];
    };
    expect(out.sound_channels[0]!.notes.map((n) => [n.y, n.x])).toEqual([
      [0, 13],
      [480, 11],
      [480, 12],
    ]);
    c.bpmEvents.push({ y: 0, bpm: Number.NaN });
    expect(() => serializeBmson(c)).toThrow(/not a JSON number/);
  });

  it('round-trips any chart it can build (property)', () => {
    const note = fc.record({
      x: fc.constantFrom(0, 1, 2, 10, 11, 12, 13, 14, 15, 20, 21, 25, 31, 34),
      y: fc.nat(100_000),
      l: fc.nat(2_000),
      c: fc.boolean(),
      vel: fc.option(fc.integer({ min: 0, max: 127 }), { nil: undefined }),
      pan: fc.option(fc.integer({ min: 0, max: 127 }), { nil: undefined }),
      kind: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }),
    });
    fc.assert(
      fc.property(
        fc.array(fc.array(note, { maxLength: 30 }), { maxLength: 6 }),
        fc.array(
          fc.record({ y: fc.nat(50_000), bpm: fc.double({ min: 1, max: 999, noNaN: true }) }),
          {
            maxLength: 5,
          },
        ),
        fc.string(),
        (channels, bpms, title) => {
          const c = newChart({ mode: '7k', tier: 'HD', title });
          let id = 1;
          channels.forEach((notes, ci) => {
            c.channels.push({ id: ci + 1, name: `s${ci}.wav` });
            for (const n of notes) {
              const rec = { id: id++, ch: ci + 1, x: n.x, y: n.y, l: n.l, c: n.c };
              if (n.vel !== undefined) Object.assign(rec, { vel: n.vel });
              if (n.pan !== undefined) Object.assign(rec, { pan: n.pan });
              if (n.kind !== undefined) Object.assign(rec, { kind: n.kind });
              c.notes.push(rec);
            }
          });
          c.bpmEvents.push(...bpms);
          const text = serializeBmson(c);
          const back = parseBmson(text).chart;
          expect(serializeBmson(back)).toBe(text);
          expect(shape(back)).toEqual(shape(c));
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('mode and tier resolution', () => {
  const info = (o: Partial<ChartInfo>): ChartInfo => ({ extra: {}, ...o });

  it('reads EZ2BMS charts literally', () => {
    expect(chartMode(info({ modeHint: 'ez2-10k' }), 'x.bmson')).toEqual({
      mode: '10k',
      source: 'mode_hint',
    });
    expect(chartMode(info({ modeHint: 'EZ2-ANDROMEDA' }), 'x.bmson')?.mode).toBe('andromeda');
    expect(chartTier(info({ tier: 'SHD' }), 'x-hd.bmson')).toBe('SHD');
  });

  it("copies the port importer's keyword-first rule", () => {
    // A 5K STANDARD chart whose name contains "space" is SpaceMix to the port.
    const i = info({ modeHint: 'ez2-5k', chartName: 'Space Street' });
    expect(portImporterMode(i, 'song.bmson')).toEqual({
      mode: '14k',
      source: 'keyword',
      keyword: 'space',
    });
    // ...and the file name counts too.
    expect(portImporterMode(info({ modeHint: 'ez2-10k' }), 'd/streetmix1p-a.bmson')?.mode).toBe(
      '5k',
    );
    expect(portImporterMode(info({ modeHint: 'ez2-10k' }), 'd/clubmix1p-a.bmson')?.mode).toBe(
      '10k',
    );
    expect(portImporterMode(info({ modeHint: 'ez2-5k-scratch' }), 'a.bmson')?.mode).toBe('scratch');
    expect(portImporterMode(info({ modeHint: 'beat-10k-fp' }), 'a.bmson')).toEqual({
      mode: '10k',
      source: 'legacy_hint',
    });
    expect(portImporterMode(info({ modeHint: 'ez2-andromeda' }), 'a.bmson')).toBeUndefined();
  });

  it("copies the port importer's tier tokens", () => {
    const t = (name: string, chartName = '') => portImporterTier(info({ chartName }), name);
    expect(t('a-shd.bmson')).toBe('SHD');
    expect(t('a.bmson', 'S.HD')).toBe('SHD');
    expect(t('streetmix1p-a-hd.bmson')).toBe('HD');
    expect(t('a_hd2.bmson')).toBe('HD'); // digits bound a token
    expect(t('a.bmson', 'EX')).toBe('EX');
    expect(t('extra.bmson')).toBe('NM'); // "ex" inside a word is not a tier
    expect(t('hdd.bmson')).toBe('NM');
    expect(t('a.bmson', 'HYPER')).toBe('NM');
  });
});

describe('legacy lane renumbering', () => {
  it('maps the port legacy 7K layout onto canonical lanes', () => {
    const c = newChart({ mode: '7k', tier: 'NM' });
    c.info.modeHint = 'beat-7k';
    c.channels.push({ id: 1, name: 'a.wav' });
    const xs = [0, 1, 5, 6, 7, 8, 9, 12];
    xs.forEach((x, i) => c.notes.push({ id: i + 1, ch: 1, x, y: i * 240, l: 0, c: false }));
    const report = remapLegacyChart(c, '7k');
    // keys 1-5 -> 11-15, 6/7 -> EF1/EF2 (31/32), 8 scratch -> 1, 9 pedal -> 10, 12 -> none (BGM).
    expect(c.notes.map((n) => n.x)).toEqual([0, 11, 15, 31, 32, 1, 10, 0]);
    expect(report).toEqual({ moved: 6, toBgm: 1 });
    expect(c.info.modeHint).toBe('ez2-7k');
  });

  it('maps the foot-pedal 10K layout', () => {
    const c = newChart({ mode: '10k', tier: 'NM' });
    c.info.modeHint = 'beat-10k-fp';
    c.channels.push({ id: 1, name: 'a.wav' });
    [6, 8, 9, 13, 14, 16].forEach((x, i) =>
      c.notes.push({ id: i + 1, ch: 1, x, y: i, l: 0, c: false }),
    );
    remapLegacyChart(c, '10k');
    expect(c.notes.map((n) => n.x)).toEqual([10, 1, 21, 25, 10, 2]);
  });
});
