import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { addChannels, placeNote, setBpmAt, setStopAt } from '../src/edit/commands';
import { lintSong, hasErrors, type LintChart } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';

function chart(
  opts: { level?: number; tier?: 'NM' | 'HD'; mode?: '5k' | '7k' | 'andromeda' } = {},
): LintChart {
  const mode = opts.mode ?? '5k';
  const tier = opts.tier ?? 'NM';
  const data = newChart({ mode, tier, level: opts.level ?? 5, title: 'T' });
  const doc = new ChartDoc(data);
  const [a] = addChannels(doc, ['a.wav']);
  placeNote(doc, { x: 11, y: 0, ch: a!.id }, false);
  return { file: `streetmix1p-t${tier === 'HD' ? '-hd' : ''}.bmson`, data, mode, tier };
}

const rules = (fs: { rule: string }[]) => fs.map((f) => f.rule).sort();

describe('lint', () => {
  it('passes a plain song', () => {
    const f = lintSong({ key: 'abc', charts: [chart()] });
    expect(hasErrors(f)).toBe(false);
    expect(f).toEqual([]);
  });

  it('refuses what EZ2PORT would hide or reject', () => {
    const hd = chart({ tier: 'HD' });
    const f = lintSong({ key: 'Bad Key', charts: [hd, chart({ tier: 'HD', level: 25 })] });
    expect(rules(f)).toEqual(['duplicate-chart', 'level', 'song-invisible', 'song-key']);
    expect(hasErrors(lintSong({ key: 'abc', charts: [chart({ mode: 'andromeda' })] }))).toBe(true);
  });

  it('flags tempo problems, STOPs, off-grid and off-mode notes, odd hold kinds, missing sounds', () => {
    const c = chart();
    const doc = new ChartDoc(c.data);
    setBpmAt(doc, 240, 2000);
    setStopAt(doc, 480, 48);
    const ch = c.data.channels[0]!.id;
    placeNote(doc, { x: 12, y: 7, ch }, false); // not on an EZ2 tick (240/48 = 5 pulses)
    placeNote(doc, { x: 31, y: 960, ch }, false); // 5K has no effectors
    placeNote(doc, { x: 13, y: 1200, ch, l: 240, kind: 4 }, false);
    const f = lintSong({ key: 'abc', charts: [c], missingSounds: new Set(['a.wav']) });
    expect(rules(f)).toEqual([
      'bpm',
      'hold-kind-max',
      'missing-sounds',
      'off-grid',
      'off-mode',
      'stops',
    ]);
    expect(f.find((x) => x.rule === 'off-mode')!.notes).toHaveLength(1);
  });

  it("warns when the port's importer would read the mode from a keyword", () => {
    const c = chart();
    c.data.info.chartName = 'Space Street'; // "space" wins in the port's keyword table
    expect(rules(lintSong({ key: 'abc', charts: [c] }))).toContain('mode-keyword');
  });
});
