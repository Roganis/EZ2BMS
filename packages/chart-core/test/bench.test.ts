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
import { writeEzff } from '../src/io/ez/ezff';
import { importEzSong } from '../src/io/ez/import';
import { convertBms } from '../src/io/bms/convert';
import { decodeBms } from '../src/io/bms/decode';
import { parseBms } from '../src/io/bms/parse';
import { newChart } from '../src/model/defaults';
import { planMidiCuts } from '../src/slice/midi';
import { encodeLegacy } from '../src/io/legacy-text';
import { exportBmsSong } from '../src/io/bms/export';
import { memoryGameFs, openGame } from '../src/io/ez/game';
import { synthGame, SYNTH_EZ_TABLES } from '../src/dev/synthgame';
import { cabinetTargets, finishCabinet, nameSounds, planCabinet } from '../src/publish/cabinet';
import { lintCabinet } from '../src/lint/cabinet';
import { applyTake, snapTake } from '../src/edit/record';
import { InputMapper } from '../src/input/mapper';
import { keyconfDefaults, KEY_CHANNELS } from '../src/input/keyconf';
import { EngineTempo } from '../src/timing/engine-tempo';
import { PlanTimeline } from '../src/timing/plan-timeline';

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

// M5: the importers at full size - a 50k-note game chart (published by
// EZ2BMS itself, read back as an original), a 57 600-note BMS, a 1 MB text's
// encoding, a 10 000-note MIDI's cuts.
describe('importers at full size', () => {
  const report: Record<string, number> = {};

  it('reads, converts and plans within budget', () => {
    const data = synthChart({ mode: '5k', notes: 50_000, channels: 1500 });
    const plan = compileChart(data, {
      columns: modeDef('5k').columns,
      name: 'bench',
      keysounds: new KeysoundRegistry(),
    });
    const ez = writeEzff(plan.ezff);
    const ezi = new TextEncoder().encode(
      plan.keysoundSlots
        .map((_, i) => `${i + 1} 1 s${String(i).padStart(4, '0')}.wav`)
        .join('\r\n'),
    );
    const [imp, ezTime] = time(() =>
      importEzSong({
        dir: 'bench',
        charts: [{ file: 'streetmix1p-bench.ez', ez, ezi }],
        locate: () => undefined,
        shipped: [],
      }),
    );
    report.ezImport50k = ezTime;
    expect(imp.charts[0]!.data.notes.length).toBe(
      plan.ezff.tracks.reduce((n, t) => n + t.records.filter((r) => r.type === 1).length, 0),
    );

    const lines = ['#BPM 150'];
    for (let i = 1; i < 100; i++)
      lines.push(`#WAV${i.toString(36).padStart(2, '0').toUpperCase()} s${i}.wav`);
    for (let m = 0; m < 800; m++)
      for (const ch of ['11', '12', '13', '14', '15', '01'])
        lines.push(
          `#${String(m).padStart(3, '0')}${ch}:${Array.from({ length: 12 }, (_, i) =>
            (((m * 7 + i) % 99) + 1).toString(36).padStart(2, '0').toUpperCase(),
          ).join('')}`,
        );
    const bytes = new TextEncoder().encode(lines.join('\r\n'));
    const [conv, bmsTime] = time(() => convertBms(parseBms(decodeBms(bytes).text)));
    report.bms57600 = bmsTime;
    expect(conv.data.notes.length).toBe(57_600);

    // A megabyte of Korean text as CP949 would be: KS X 1001 pairs.
    const kr = new Uint8Array(1 << 20);
    for (let i = 0; i < kr.length; i += 2) {
      kr[i] = 0xb0 + ((i >> 1) % 40);
      kr[i + 1] = 0xa1 + ((i >> 3) % 90);
    }
    const [enc, encTime] = time(() => decodeBms(kr));
    report.encoding1MB = encTime;
    expect(enc.encoding).toBe('euc-kr');

    // 10 000 MIDI notes cutting a stem.
    const doc = new ChartDoc(newChart({ mode: '5k', tier: 'NM', bpm: 150 }));
    doc.transact('stem', (tx) => {
      tx.insertChannel({ name: 'stem.wav' });
      tx.insertNotes([{ id: doc.newNoteId(), ch: 1, x: 0, y: 0, l: 0, c: false }]);
    });
    const smf = {
      format: 0 as const,
      ppq: 480,
      tracks: [{ name: '', notes: 10_000, channels: [0] }],
      notes: Array.from({ length: 10_000 }, (_, i) => ({
        tick: i * 120,
        track: 0,
        channel: 0,
        key: 60,
        velocity: 100,
      })),
      tempos: [{ tick: 0, usPerQuarter: 400_000 }],
    };
    const [midiPlan, midiTime] = time(() => planMidiCuts(doc, 'stem.wav', smf, { tempo: 'chart' }));
    report.midiPlan10k = midiTime;
    expect('ys' in midiPlan && midiPlan.ys.length).toBe(9_999);
    console.log(
      'bench M5 (ms):',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.ezImport50k).toBeLessThan(2000);
    expect(report.bms57600).toBeLessThan(2000);
    expect(report.encoding1MB).toBeLessThan(1000);
    expect(report.midiPlan10k).toBeLessThan(1000);
  });
});

// M6: the exporters at full size - building the CP949 and Shift-JIS encoders
// (inverting the decoders, once per session), a 50k-note, 1500-sound chart
// sent into the synthetic game (plan, names, encrypted bytes, song.bin, the
// checks with every sound's length) and written as BMS.
describe('exporters at full size', () => {
  const report: Record<string, number> = {};

  it('builds encoders, plans a cabinet export and writes BMS within budget', async () => {
    report.encoderCp949 = time(() => encodeLegacy('\uAC00', 'euc-kr'))[1];
    report.encoderSjis = time(() => encodeLegacy('\u3042', 'shift_jis'))[1];

    const g = synthGame();
    const game = await openGame(memoryGameFs(g.files), g.exe, undefined, {
      tables: SYNTH_EZ_TABLES,
    });
    const target = cabinetTargets(game).find((t) => t.dir === 'alpha')!;
    const files = await game.fs.list('sound/alpha');
    const data = synthChart({ mode: '5k', notes: 50_000, channels: 1500 });
    const samples = () => ({ frames: 22_050 });
    const [out, cabTime] = time(() => {
      const plan = planCabinet({
        target,
        files,
        gds: game.gds,
        charts: [{ file: 'streetmix1p-bench-shd.bmson', data, mode: '5k', tier: 'SHD' }],
        samples,
      });
      const names = nameSounds(plan, files, () => null);
      const out = finishCabinet(plan, names, {
        tables: SYNTH_EZ_TABLES,
        songdb: game.songdbFiles,
        ...(game.songdbTables ? { songdbTables: game.songdbTables } : {}),
      });
      return { plan, out, findings: lintCabinet(plan, { out, names, samples }) };
    });
    report.cabinet50k = cabTime;
    const ez = out.out.files.find((f) => f.kind === 'ez')!;
    report.cabinetEzKB = ez.bytes.length / 1024;
    // Far past what the original can load, and said so.
    expect(out.findings.some((f) => f.rule === 'cabinet-size')).toBe(true);

    // The same notes as whole sounds, at twice the resolution: its slices
    // (7 000 and more) are past what a BMS can name (3 843), and its 1 330
    // measures past the 999 a BMS has; at 480 it is 665.
    const whole = {
      ...data,
      info: { ...data.info, resolution: 480 },
      notes: data.notes.map((n) => ({ ...n, c: false })),
    };
    const [bms, bmsTime] = time(() =>
      exportBmsSong([{ file: 'bench.bmson', data: whole, mode: '5k', tier: 'NM' }], {
        map: 'ez2',
        resolve: (n) => n,
      }),
    );
    report.bmsWrite50k = bmsTime;
    expect(bms.files).toHaveLength(1);
    console.log(
      'bench M6 (ms):',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.encoderCp949).toBeLessThan(2000);
    expect(report.encoderSjis).toBeLessThan(2000);
    expect(report.cabinet50k).toBeLessThan(5000);
    expect(report.bmsWrite50k).toBeLessThan(3000);
  });
});

// M7: takes at full size - 1000 presses with the brush on the 50k-note chart,
// and 300 presses keying a sliced 5-minute stem in a Classic song (each keying
// is checked for sounding the same, which is where a Classic take's time goes).
describe('takes at full size', () => {
  it('applies a brush take and a Classic take within budget', () => {
    const report: Record<string, number> = {};
    const big = new ChartDoc(synthChart({ mode: '5k', notes: 50_000, channels: 1500 }));
    const res = big.resolution;
    const brushNotes = Array.from({ length: 1000 }, (_, i) => ({
      x: 11 + (i % 5),
      y: (i * res) / 4 + res / 8,
      l: 0,
      offsetMs: 0,
    }));
    const [brush, brushMs] = time(() => applyTake(big, brushNotes, { brush: 1 }));
    report.brush1000 = brushMs;
    expect(brush.placed + brush.clash).toBe(1000);

    // A 5-minute stem at 150 BPM (750 beats), sliced every beat.
    const data = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
    data.channels = [{ id: 1, name: 'stem.wav' }];
    data.notes = Array.from({ length: 750 }, (_, b) => ({
      id: b + 1,
      ch: 1,
      x: 0,
      y: b * 240,
      l: 0,
      c: b > 0,
    }));
    const stem = new ChartDoc(data);
    const samples = () => ({ frames: 300 * 44100 });
    const classicNotes = Array.from({ length: 300 }, (_, i) => ({
      x: 11 + (i % 5),
      y: i * 480 + (i % 2 ? 120 : 0),
      l: 0,
      offsetMs: 0,
    }));
    const [classic, classicMs] = time(() =>
      applyTake(stem, classicNotes, { classic: { samples, brush: 1 } }),
    );
    report.classic300 = classicMs;
    expect(classic.placed).toBe(300);
    console.log(
      'bench M7 (ms):',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.brush1000).toBeLessThan(2000);
    expect(report.classic300).toBeLessThan(10000);
  });
});

// M7: input at full rate - what the input hub asks of the mapper for every
// event: a turntable axis streaming (the cabinet bridge reports its encoders
// every 10 ms or on change), buttons pressed and released, and a take of
// 5000 presses snapped to the grid.
describe('input at full rate', () => {
  it('maps a turntable and buttons, and snaps a long take, within budget', () => {
    const conf = keyconfDefaults();
    conf.names[KEY_CHANNELS.indexOf('Key1')] = ['Z', '0810:e501/b0'];
    conf.analog = ['0810:e501/a0', ''];
    const m = new InputMapper(conf);
    const N = 100_000;
    const [axisEdges, axisMs] = time(() => {
      let n = 0;
      for (let i = 0; i < N; i++) {
        // Turning steadily: 3 units of 256 each report, wrapping.
        const v = ((((i * 3) % 256) - 128) * 256) | 0;
        n += m.input({ kind: 'axis', device: '0810:e501', index: 0, value: v, ms: i * 10 }).length;
      }
      return n;
    });
    const [btnEdges, btnMs] = time(() => {
      let n = 0;
      for (let i = 0; i < N; i++)
        n += m.input({
          kind: 'button',
          device: '0810:e501',
          index: 0,
          down: i % 2 === 0,
          ms: N * 10 + i * 20,
        }).length;
      return n;
    });
    expect(axisEdges).toBeGreaterThan(0);
    // Every press and release, and the turntable's last hold running out.
    expect(btnEdges).toBe(N + 1);
    const tl = new PlanTimeline(new EngineTempo(150, []), 240, []);
    const presses = Array.from({ length: 5000 }, (_, i) => ({
      x: 11 + (i % 5),
      downMs: i * 100 + (i % 7) - 3,
      upMs: i * 100 + 40,
    }));
    const [notes, snapMs] = time(() =>
      snapTake(presses, tl, { step: 60, holds: true, holdMinMs: 200 }),
    );
    expect(notes).toHaveLength(5000);
    const report = {
      axisUsPerEvent: (axisMs * 1000) / N,
      buttonUsPerEvent: (btnMs * 1000) / N,
      snap5000: snapMs,
    };
    console.log(
      'bench M7 input:',
      Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    );
    expect(report.axisUsPerEvent).toBeLessThan(50);
    expect(report.buttonUsPerEvent).toBeLessThan(50);
    expect(report.snap5000).toBeLessThan(500);
  });
});
