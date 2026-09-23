// bmson that is not EZ2BMS's own: 0.21 (read by upgrading it), `beat-*` lane
// numbering (both ways of numbering beat-10k), converters' output - and the
// notes opening them leaves for Issues.
import { describe, expect, it } from 'vitest';
import { synthGds } from '../src/dev/synthgame';
import { parseGds } from '../src/ez2data/gds';
import { openChart } from '../src/io/bmson/open';
import { BmsonError, parseBmson } from '../src/io/bmson/parse';
import { serializeBmson } from '../src/io/bmson/serialize';
import { tenKeyNumbering } from '../src/io/bmson/legacy-remap';
import { lintChart } from '../src/lint/lint';
import { MODES } from '../src/modes/ids';
import { columnsFromGds, modeDef } from '../src/modes/registry';
import { v021 } from './legacy-fixtures';

describe('bmson 0.21', () => {
  it('is read as 1.0, keeping what it does not know', () => {
    const { chart, upgradedFrom, warnings } = parseBmson(JSON.stringify(v021()));
    expect(upgradedFrom).toBe('0.21');
    expect(warnings).toEqual([]);
    expect(chart.version).toBe('1.0.0');
    expect(chart.info).toMatchObject({
      title: 'Old Song',
      initBpm: 150,
      judgeRank: 3,
      level: 5,
      modeHint: 'beat-7k',
      resolution: 240,
    });
    // An absolute 0.21 TOTAL is not a 1.0 (relative) one.
    expect(chart.info.total).toBeUndefined();
    expect(chart.info.extra).toEqual({ x_note: 'kept', x_total_v021: 300 });
    expect(chart.lines).toEqual([{ y: 0 }, { y: 960 }]);
    expect(chart.bpmEvents).toEqual([{ y: 960, bpm: 175 }]);
    expect(chart.stopEvents).toEqual([{ y: 1200, duration: 120 }]);
    expect(chart.channels.map((c) => c.name)).toEqual(['a.wav']);
    expect(chart.notes.map((n) => [n.x, n.y, n.l, n.c])).toEqual([
      [1, 0, 0, false],
      [8, 240, 480, false],
      [0, 480, 0, true],
    ]);
    expect(chart.bga?.header).toEqual([{ id: 1, name: 'bg.mp4' }]);
    expect(chart.bga?.bga).toEqual([{ y: 0, id: 1 }]);
    expect(chart.extra).toEqual({ x_root: { any: 1 } });
  });

  it('saves as 1.0, which then reads back unchanged', () => {
    const a = parseBmson(JSON.stringify(v021())).chart;
    const text = serializeBmson(a);
    expect(JSON.parse(text).version).toBe('1.0.0');
    const b = parseBmson(text);
    expect(b.upgradedFrom).toBeUndefined();
    expect(serializeBmson(b.chart)).toBe(text);
  });

  it('opens on 7K lanes and says so', () => {
    const o = openChart('old.bmson', JSON.stringify(v021()));
    expect(o.mode).toBe('7k');
    expect(o.converted).toBe(true);
    // 0.21 is the 7-key layout: key 1 and the turntable (x 8).
    expect(o.chart.notes.map((n) => n.x)).toEqual([11, 1, 0]);
    expect(o.notes.map((n) => [n.rule, n.severity])).toEqual([
      ['bmson-0.21', 'info'],
      ['legacy-lanes', 'info'],
    ]);
    expect(o.notes[1]!.message).toContain('2 notes moved');
  });

  it('refuses a versionless document that is not 0.21 either', () => {
    expect(() => parseBmson('{"info":{}}')).toThrow(BmsonError);
  });
});

/** A plain beat-10k chart with lane notes at the given x. */
function tenKey(xs: number[], hint = 'beat-10k') {
  return JSON.stringify({
    version: '1.0.0',
    info: { title: 'T', mode_hint: hint, init_bpm: 120, resolution: 240, level: 1 },
    sound_channels: [
      { name: 'a.wav', notes: xs.map((x, i) => ({ x, y: i * 240, l: 0, c: false })) },
    ],
  });
}

describe('beat-10k numbering', () => {
  it('reads notes on x 9-10 as the bmson spec numbering (2P keys 9-13, scratch 16)', () => {
    const o = openChart('a.bmson', tenKey([1, 5, 8, 9, 10, 11, 12, 13, 16]));
    expect(o.mode).toBe('10k');
    expect(o.chart.notes.map((n) => n.x)).toEqual([11, 15, 1, 21, 22, 23, 24, 25, 2]);
    expect(o.notes.find((n) => n.rule === 'legacy-lanes')!.message).toContain('bmson spec');
    expect(o.notes.some((n) => n.rule === 'legacy-10k-numbering')).toBe(false);
  });

  it("reads x 11-15 as EZ2's numbering, as EZ2PORT does", () => {
    const o = openChart('a.bmson', tenKey([1, 7, 8, 11, 14, 15, 16]));
    expect(o.chart.notes.map((n) => n.x)).toEqual([11, 10, 1, 21, 24, 25, 2]);
    expect(o.notes.some((n) => n.rule === 'legacy-10k-numbering')).toBe(false);
  });

  it('reads 2P notes only on x 11-13 the port way, and warns', () => {
    const c = parseBmson(tenKey([1, 11, 12, 13])).chart;
    expect(tenKeyNumbering(c)).toEqual({ numbering: 'ez2', ambiguous: true });
    const o = openChart('a.bmson', tenKey([1, 11, 12, 13]));
    expect(o.chart.notes.map((n) => n.x)).toEqual([11, 21, 22, 23]);
    const w = o.notes.find((n) => n.rule === 'legacy-10k-numbering')!;
    expect(w.severity).toBe('warning');
    expect(w.message).toContain('x 11-13');
  });

  it('is not guessed for the foot-pedal layout, which is always the spec numbering', () => {
    const o = openChart('a.bmson', tenKey([6, 9, 13], 'beat-10k-fp'));
    expect(o.chart.notes.map((n) => n.x)).toEqual([10, 21, 25]);
    expect(o.notes.some((n) => n.rule === 'legacy-10k-numbering')).toBe(false);
  });
});

describe('opening converters’ bmson', () => {
  it('opens circus2bmson-shaped output: beat-7k, resolution 480, everything background', () => {
    const doc = {
      version: '1.0.0',
      info: { title: 'Tracker Song', mode_hint: 'beat-7k', init_bpm: 125, resolution: 480 },
      bpm_events: [],
      sound_channels: [
        { name: 'ch01_piano.wav', notes: [{ x: 0, y: 0, l: 0, c: false }] },
        { name: 'ch02_bass.wav', notes: [{ x: 0, y: 960, l: 0, c: false }] },
      ],
    };
    const o = openChart('tracker.bmson', JSON.stringify(doc));
    expect(o.mode).toBe('7k');
    expect(o.chart.info.resolution).toBe(480);
    expect(o.chart.notes.every((n) => n.x === 0)).toBe(true);
    expect(o.notes.find((n) => n.rule === 'legacy-lanes')!.message).toContain('0 notes moved');
  });

  it('lists a problem made many times once, with a count', () => {
    const notes = Array.from({ length: 30 }, () => ({ x: 1 }));
    const doc = { version: '1.0.0', info: {}, sound_channels: [{ name: 'a.wav', notes }] };
    const o = openChart('a.bmson', JSON.stringify(doc));
    const read = o.notes.filter((n) => n.rule === 'bmson-read');
    expect(read).toHaveLength(1);
    expect(read[0]!.message).toContain('and 29 more like it');
  });

  it('puts the notes in Issues with the chart', () => {
    const o = openChart('old.bmson', JSON.stringify(v021()));
    const f = lintChart({
      file: 'old.bmson',
      data: o.chart,
      mode: o.mode,
      tier: o.tier,
      notes: o.notes,
    });
    expect(f.filter((x) => x.rule === 'bmson-0.21')).toEqual([
      expect.objectContaining({ chart: 'old.bmson', severity: 'info' }),
    ]);
  });
});

describe('synthetic .gds', () => {
  it.each(MODES.map((m) => m.id))('%s reads back as the bundled lane table', (mode) => {
    const got = columnsFromGds(mode, parseGds(synthGds(mode)));
    expect(got.skipped).toEqual([]);
    expect(got.columns.map((c) => `${c.x}@${c.track}`)).toEqual(
      modeDef(mode).columns.map((c) => `${c.x}@${c.track}`),
    );
  });
});
