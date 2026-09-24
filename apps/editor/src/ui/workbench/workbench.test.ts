import { newChart, soundUsage } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import {
  filterCounts,
  formatLength,
  rowOffsets,
  visibleRows,
  workbenchRows,
  type Row,
  type RowOptions,
} from './workbench';

function song() {
  const data = newChart({ mode: '5k', tier: 'NM', level: 1 });
  data.channels = ['hit_10.wav', 'hit_2.wav', 'pad.wav', 'gone.wav', 'kick.wav'].map((name, i) => ({
    id: i + 1,
    name,
  }));
  data.notes = [
    { id: 1, ch: 1, x: 0, y: 0, l: 0, c: false },
    { id: 2, ch: 2, x: 11, y: 0, l: 0, c: false },
    { id: 3, ch: 2, x: 0, y: 60, l: 0, c: false },
    { id: 4, ch: 4, x: 0, y: 60, l: 0, c: false },
  ];
  return soundUsage(
    [{ file: 'a.bmson', data }],
    ['hit_10.wav', 'hit_2.wav', 'pad.wav', 'kick.wav', 'snare.wav'],
  );
}

const base: RowOptions = {
  filter: 'all',
  sort: 'name',
  query: '',
  cols: 2,
  lengthOf: () => undefined,
};
const names = (rows: ReturnType<typeof workbenchRows>) =>
  rows.flatMap((r) =>
    r.segments.flatMap((g) => [...(g.key ? [`#${g.key}`] : []), ...g.items.map((s) => s.name)]),
  );

describe('the workbench grid', () => {
  it('sorts naturally and groups by name', () => {
    expect(names(workbenchRows(song(), base))).toEqual([
      'gone.wav',
      'hit_2.wav',
      'hit_10.wav',
      'kick.wav',
      'pad.wav',
      'snare.wav',
    ]);
    expect(names(workbenchRows(song(), { ...base, sort: 'group' }))).toEqual([
      '#gone',
      'gone.wav',
      '#hit',
      'hit_2.wav',
      'hit_10.wav',
      '#kick',
      'kick.wav',
      '#pad',
      'pad.wav',
      '#snare',
      'snare.wav',
    ]);
    expect(names(workbenchRows(song(), { ...base, sort: 'usage' })).slice(0, 2)).toEqual([
      'hit_2.wav',
      'gone.wav',
    ]);
  });

  it('filters: used, not used, missing, unused in a chart, and by text', () => {
    const f = (filter: RowOptions['filter'], query = '') =>
      names(workbenchRows(song(), { ...base, filter, query }));
    expect(f('used')).toEqual(['gone.wav', 'hit_2.wav', 'hit_10.wav', 'kick.wav', 'pad.wav']);
    expect(f('unused')).toEqual(['snare.wav']);
    expect(f('missing')).toEqual(['gone.wav']);
    expect(f('channels')).toEqual(['kick.wav', 'pad.wav']);
    expect(f('all', 'HIT')).toEqual(['hit_2.wav', 'hit_10.wav']);
    expect(filterCounts(song())).toEqual({ all: 6, used: 5, unused: 1, missing: 1, channels: 2 });
  });

  it('puts `cols` cards on a row, small groups sharing one, and finds the rows on screen', () => {
    const rows = workbenchRows(song(), { ...base, cols: 4 });
    expect(rows.map((r) => r.segments.flatMap((g) => g.items).length)).toEqual([4, 2]);
    // By group, 4 across: gone | hit_2 hit_10 | kick, then pad | snare.
    const g = workbenchRows(song(), { ...base, sort: 'group', cols: 4 });
    expect(g.map((r) => r.segments.map((s) => `${s.key}:${s.items.length}`))).toEqual([
      ['gone:1', 'hit:2', 'kick:1'],
      ['pad:1', 'snare:1'],
    ]);
    // A group never splits when it fits whole on the next row; a long one continues unlabelled.
    const g2 = workbenchRows(song(), { ...base, sort: 'group', cols: 2 });
    expect(g2.map((r) => r.segments.map((s) => `${s.key}:${s.items.length}`))).toEqual([
      ['gone:1'],
      ['hit:2'],
      ['kick:1', 'pad:1'],
      ['snare:1'],
    ]);
    const g1 = workbenchRows(song(), { ...base, sort: 'group', cols: 1 });
    expect(g1.slice(1, 3).map((r) => [r.labelled, r.segments[0]!.key])).toEqual([
      [true, 'hit'],
      [false, null],
    ]);
    expect(rowOffsets(g1.slice(1, 3), 20, 100)).toEqual([0, 120, 220]);

    const many: Row[] = Array.from({ length: 1000 }, (_, i) => ({
      segments: [],
      labelled: i % 10 === 0,
    }));
    const off = rowOffsets(many, 30, 100);
    expect(off.at(-1)).toBe(100 * 30 + 1000 * 100);
    const [a, b] = visibleRows(off, 50_000, 800, 0);
    expect(off[a]!).toBeLessThanOrEqual(50_000);
    expect(off[a + 1]!).toBeGreaterThan(50_000);
    expect(off[b - 1]!).toBeLessThan(50_800);
    expect(off[b]!).toBeGreaterThanOrEqual(50_800);
    expect(visibleRows(off, 0, 800, 2)[0]).toBe(0);
  });

  it('formats lengths', () => {
    expect(formatLength(0.25)).toBe('0.25 s');
    expect(formatLength(12.34)).toBe('12.3 s');
    expect(formatLength(184)).toBe('3:04');
    expect(formatLength(undefined)).toBe('-');
  });
});
