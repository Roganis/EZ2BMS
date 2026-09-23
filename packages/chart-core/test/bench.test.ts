// The M1 performance budget on a 50k-note, 1500-sound chart: everything the
// editor does per edit or per frame must stay far below a frame, everything
// per save or per publish well under a second. Budgets are generous (CI
// machines vary); the measured numbers go in docs/perf-log.md.

import { describe, expect, it } from 'vitest';
import { placeNote, moveNotes } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { serializeBmson } from '../src/io/bmson/serialize';
import { parseBmson } from '../src/io/bmson/parse';
import { lintSong } from '../src/lint/lint';
import { modeDef } from '../src/modes/registry';
import { compileChart } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';
import { synthChart, synthSoundName } from '../src/dev/synth';
import { buildGroups } from '../src/sound/grouping';
import { soundUsage } from '../src/sound/usage';
import { planSoundRename } from '../src/sound/rename';
import { audible, fingerprint } from '../src/publish/audible';
import { classicCandidates } from '../src/edit/classic';

function time<T>(f: () => T): [T, number] {
  const t0 = performance.now();
  const r = f();
  return [r, performance.now() - t0];
}

describe('50k notes, 1500 sounds', () => {
  const data = synthChart({ mode: '14k', notes: 50_000, channels: 1500 });
  const report: Record<string, number> = {};

  it('builds, queries, edits, saves, loads, compiles and lints within budget', () => {
    expect(data.notes.length).toBe(50_000);
    const [doc, build] = time(() => new ChartDoc(data));
    report.indexBuild = build;
    const cols = modeDef('14k').columns;
    const res = doc.resolution;
    // One frame's worth of visible-range queries (every lane, two measures).
    const [, query] = time(() => {
      for (let i = 0; i < 100; i++) {
        const y0 = (i * 997) % (data.notes.at(-1)!.y - res * 8);
        for (const c of cols) doc.index.inRange(c.x, y0, y0 + res * 8);
        doc.index.inRange(0, y0, y0 + res * 8);
      }
    });
    report.frameQueries = query / 100;
    const [, edit] = time(() => {
      const idx = placeNote(doc, { x: 0, y: 12345, ch: 1 }, false);
      moveNotes(doc, [idx!], { dy: res });
      doc.undo();
      doc.undo();
    });
    report.editUndo = edit;
    const [text, save] = time(() => serializeBmson(doc.data));
    report.serialize = save;
    const [, load] = time(() => parseBmson(text));
    report.parse = load;
    const [, compile] = time(() =>
      compileChart(doc.data, { columns: cols, name: 'bench', keysounds: new KeysoundRegistry() }),
    );
    report.compile = compile;
    const [, lint] = time(() =>
      lintSong({
        key: 'bench',
        charts: [{ file: 'spacemix1p-bench-ex.bmson', data: doc.data, mode: '14k', tier: 'EX' }],
      }),
    );
    report.lint = lint;
    console.log(
      'bench (ms):',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.frameQueries).toBeLessThan(4);
    expect(report.editUndo).toBeLessThan(50);
    expect(report.indexBuild).toBeLessThan(1500);
    expect(report.serialize).toBeLessThan(3000);
    expect(report.parse).toBeLessThan(3000);
    expect(report.compile).toBeLessThan(5000);
    expect(report.lint).toBeLessThan(1500);
  });
});

// M2: the keysound workbench and Classic mode on the same chart, with sounds
// named in kits so there are groups (60 of ~25).
describe('50k notes, 1500 grouped sounds: workbench and Classic mode', () => {
  const data = synthChart({ mode: '14k', notes: 50_000, channels: 1500, names: 'grouped' });
  const folder = Array.from({ length: 1500 }, (_, i) => synthSoundName(i, 'grouped'));
  const report: Record<string, number> = {};

  it('groups, counts usage, fingerprints and finds what to key within budget', () => {
    const doc = new ChartDoc(data);
    const res = doc.resolution;
    const [groups, group] = time(() =>
      buildGroups(doc.data.channels, (ch) => doc.index.channel(ch).filter((n) => n.x === 0), {
        minExtent: res / 2,
        keepEmpty: false,
      }),
    );
    report.rackGroups = group;
    expect(groups.length).toBe(60);
    const [usage, count] = time(() => soundUsage([{ file: 'a.bmson', data: doc.data }], folder));
    report.soundUsage = count;
    expect(usage.unusedFiles).toEqual([]);
    const [plan, rename] = time(() =>
      planSoundRename([{ file: 'a.bmson', data: doc.data }], folder, folder[7]!, 'renamed.wav'),
    );
    report.renamePlan = rename;
    expect(plan.ok).toBe(true);
    // Every sound one second long: Classic can see what is ringing.
    const samples = () => ({ frames: 44100 });
    const [, one] = time(() => audible(doc.data, { srcs: new Set([folder[3]!]), samples }));
    report.audibleOneSound = one;
    const [, all] = time(() => fingerprint(doc.data, samples));
    report.fingerprintWhole = all;
    // Hovering: the first call builds Classic's cached analysis, the rest reuse it.
    const env = { samples, brush: 1 };
    const [, first] = time(() => classicCandidates(doc, 11, res * 64 + res / 8, 0, env));
    report.hoverFirst = first;
    const hovers: number[] = [];
    for (let i = 0; i < 60; i++) {
      const y = res * (80 + i * 37) + ((i * 13) % 8) * (res / 8);
      hovers.push(time(() => classicCandidates(doc, 11 + (i % 5), y, 0, env))[1]);
    }
    hovers.sort((a, b) => a - b);
    report.hoverMedian = hovers[hovers.length >> 1]!;
    report.hoverP95 = hovers[Math.floor(hovers.length * 0.95)]!;
    console.log(
      'bench M2 (ms):',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.rackGroups).toBeLessThan(500);
    expect(report.soundUsage).toBeLessThan(500);
    expect(report.renamePlan).toBeLessThan(100);
    expect(report.hoverMedian).toBeLessThan(8);
    expect(report.fingerprintWhole).toBeLessThan(5000);
  });
});
