import fc from 'fast-check';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { addChannels, placeNote, setBpmAt } from '../src/edit/commands';
import { newChart } from '../src/model/defaults';
import { modeDef } from '../src/modes/registry';
import { compileSong } from '../src/publish/package';
import type { ChartPlan } from '../src/publish/chart-plan';
import { judgeSim } from '../src/engine/judge-sim';
import { J, J_NAMES, Score, holdInstalments, holdStep, noteCounted } from '../src/engine/score';
import { effectiveIni, songIniFrom, type SongIni } from '../src/engine/songini';
import { PlaySession } from '../src/engine/session';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

interface OState {
  counts: number[];
  notes: number;
  combo: number;
  max_combo: number;
  score: number;
  gauge: number;
  failed: number;
  pending: number;
  hold_paid: number;
}

type Op =
  | { k: 'judge'; dt: number }
  | { k: 'apply'; j: J }
  | { k: 'press'; lane: number; j: J; raw: number; start: number; kind: number }
  | { k: 'held'; lane: number; held: boolean }
  | { k: 'advance'; tick: number }
  | { k: 'step' | 'inst' | 'counted'; kind: number; raw: number };

const jArb = fc.constantFrom(J.KOOL, J.COOL, J.GOOD, J.FAIL, J.MISS);
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    k: fc.constant('judge' as const),
    dt: fc.double({ min: -90, max: 90, noNaN: true }),
  }),
  fc.record({ k: fc.constant('apply' as const), j: jArb }),
  fc.record({
    k: fc.constant('press' as const),
    lane: fc.integer({ min: 0, max: 5 }),
    j: jArb,
    raw: fc.integer({ min: 7, max: 400 }),
    start: fc.integer({ min: 0, max: 2000 }),
    kind: fc.integer({ min: 0, max: 13 }),
  }),
  fc.record({
    k: fc.constant('held' as const),
    lane: fc.integer({ min: 0, max: 5 }),
    held: fc.boolean(),
  }),
  fc.record({ k: fc.constant('advance' as const), tick: fc.integer({ min: 0, max: 3000 }) }),
  fc.record({
    k: fc.constantFrom('step' as const, 'inst' as const, 'counted' as const),
    kind: fc.integer({ min: 0, max: 13 }),
    raw: fc.integer({ min: 0, max: 600 }),
  }),
);

const iniArb: fc.Arbitrary<SongIni> = fc
  .record({
    kool: fc.integer({ min: 1, max: 12 }),
    cool: fc.integer({ min: 12, max: 35 }),
    good: fc.integer({ min: 35, max: 60 }),
    miss: fc.integer({ min: 60, max: 90 }),
    gc: fc.double({ min: 0, max: 1, noNaN: true }),
    gg: fc.double({ min: 0, max: 0.5, noNaN: true }),
    gm: fc.double({ min: -10, max: 0, noNaN: true }),
    gf: fc.double({ min: -20, max: 0, noNaN: true }),
  })
  .map((r) => ({
    level: 1,
    measureScale: 1.6,
    kool: r.kool,
    cool: r.cool,
    good: r.good,
    miss: r.miss,
    gaugeKool: Math.fround(r.gc),
    gaugeCool: Math.fround(r.gc),
    gaugeGood: Math.fround(r.gg),
    gaugeMiss: Math.fround(r.gm),
    gaugeFail: Math.fround(r.gf),
  }));

function tsState(s: Score): OState {
  return {
    counts: [...s.counts],
    notes: s.notes,
    combo: s.combo,
    max_combo: s.maxCombo,
    score: s.score,
    gauge: s.gauge,
    failed: s.failed ? 1 : 0,
    pending: s.holdPending(),
    hold_paid: s.holdPaid,
  };
}

describe.skipIf(!ORACLE)('scoring against EZ2PORT (oracle)', () => {
  it('judge, combo, gauge, score and the hold machine agree op for op', () => {
    fc.assert(
      fc.property(iniArb, fc.array(opArb, { minLength: 1, maxLength: 80 }), (ini, ops) => {
        const lines = [
          `ini ${ini.kool} ${ini.cool} ${ini.good} ${ini.miss} ${ini.gaugeKool} ${ini.gaugeCool} ${ini.gaugeGood} ${ini.gaugeMiss} ${ini.gaugeFail}`,
        ];
        const s = new Score();
        const want: unknown[] = [null];
        for (const op of ops) {
          switch (op.k) {
            case 'judge': {
              lines.push(`judge ${op.dt.toPrecision(17)}`);
              const dt = Number(op.dt.toPrecision(17));
              const a = Math.abs(dt);
              want.push(
                J_NAMES[
                  a <= ini.kool
                    ? J.KOOL
                    : a <= ini.cool
                      ? J.COOL
                      : a <= ini.good
                        ? J.GOOD
                        : a <= ini.miss
                          ? J.FAIL
                          : J.NONE
                ].replace('-', 'NONE'),
              );
              break;
            }
            case 'apply':
              lines.push(`apply ${J_NAMES[op.j]}`);
              s.apply(op.j, ini);
              want.push(tsState(s));
              break;
            case 'press':
              lines.push(`press ${op.lane} ${J_NAMES[op.j]} ${op.raw} ${op.start} ${op.kind}`);
              s.holdPress(op.lane, op.j, op.raw, op.start, op.kind, 192, ini);
              want.push(tsState(s));
              break;
            case 'held':
              lines.push(`held ${op.lane} ${op.held ? 1 : 0}`);
              s.setHeld(op.lane, op.held);
              want.push(tsState(s));
              break;
            case 'advance':
              lines.push(`advance ${op.tick}`);
              s.holdAdvance(op.tick, ini);
              want.push(tsState(s));
              break;
            case 'step':
              lines.push(`step ${op.kind} ${op.raw}`);
              want.push(holdStep(op.kind, 192, op.raw));
              break;
            case 'inst':
              lines.push(`inst ${op.kind} ${op.raw} 0`);
              want.push(holdInstalments(op.kind, 192, op.raw, 0));
              break;
            case 'counted':
              lines.push(`counted ${op.kind} ${op.raw} 0`);
              want.push(noteCounted(op.kind, 192, op.raw, 0));
              break;
          }
        }
        // The oracle reads the ini floats back through %f parsing, so feed it
        // f32-exact decimals and compare gauges as f32.
        const got = oracle<unknown[]>(['score'], lines.join('\n') + '\n').map((v) =>
          v && typeof v === 'object' && 'gauge' in v
            ? { ...(v as OState), gauge: Math.fround((v as OState).gauge) }
            : v,
        );
        expect(got).toEqual(want);
      }),
      { numRuns: 120 },
    );
  });
});

/** A 7K chart with holds of every kind and a tempo change. */
function holdChart(kinds = [0, 1, 2, 3, 4, 5, 6, 7, 9, 0]) {
  const data = newChart({ mode: '7k', tier: 'NM', level: 5, bpm: 150 });
  const doc = new ChartDoc(data);
  const [a] = addChannels(doc, ['a.wav']);
  const xs = [1, 11, 12, 13, 14, 15, 10, 31, 32];
  let y = 0;
  for (let k = 0; k < 40; k++) {
    const x = xs[k % xs.length]!;
    const kind = kinds[k % kinds.length]!;
    placeNote(doc, { x, y, l: k % 3 === 0 ? 240 + (k % 4) * 60 : 0, ch: a!.id, kind }, false);
    y += 120;
  }
  placeNote(doc, { x: 0, y: 0, ch: a!.id }, false);
  setBpmAt(doc, 2400, 190);
  return data;
}

describe.skipIf(!ORACLE)('synthetic player against EZ2PORT (oracle)', () => {
  it('matches tools/ez2judge.c number for number', () => {
    withTmpDir((dir) => {
      const plan = compileSong({ key: 'holds', title: '', artist: '', genre: '' }, [
        { data: holdChart(), mode: '7k', tier: 'NM' },
      ]);
      const out = join(dir, 'holds');
      mkdirSync(out);
      for (const f of plan.files) writeFileSync(join(out, f.path), f.bytes);
      const stem = join(out, plan.charts[0]!.stem);
      const pc = plan.charts[0]!;
      const raw = songIniFrom(5, holdChart().info.judgementDeltas!, holdChart().info.lifeDeltas!);
      const ini = effectiveIni(raw, '7k');
      const lanes = modeDef('7k').columns.map((c) => c.track);
      fc.assert(
        fc.property(
          fc.double({ min: -120, max: 120, noNaN: true }),
          fc.double({ min: 0, max: 80, noNaN: true }),
          fc.integer({ min: 1, max: 1_000_000 }),
          (off, jit, seed) => {
            const o = oracle<{
              total_notes: number;
              counts: number[];
              max_combo: number;
              score: number;
              gauge: number;
              failed: number;
              grade: string;
            }>([
              'judge-sim',
              `${stem}.ez`,
              `${stem}.ini`,
              '7StreetMix',
              off.toPrecision(17),
              jit.toPrecision(17),
              String(seed),
            ]);
            const r = judgeSim(
              pc.plan.ezff,
              ini,
              lanes,
              Number(off.toPrecision(17)),
              Number(jit.toPrecision(17)),
              seed,
            );
            expect(r.totalNotes).toBe(o.total_notes);
            expect(r.counts).toEqual(o.counts);
            expect(r.maxCombo).toBe(o.max_combo);
            expect(r.score).toBe(o.score);
            expect(r.gauge).toBe(Math.fround(o.gauge));
            expect(r.failed ? 1 : 0).toBe(o.failed);
            expect(r.grade).toBe(o.grade);
          },
        ),
        { numRuns: 40 },
      );
    });
  });
});

describe('play session', () => {
  const ini = effectiveIni(
    songIniFrom(
      5,
      { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 },
      { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 },
    ),
    '7k',
  );
  const setup = (autoplay: boolean, kinds?: number[]) => {
    const plan = compileSong({ key: 'holds', title: '', artist: '', genre: '' }, [
      { data: holdChart(kinds), mode: '7k', tier: 'NM' },
    ]).charts[0]!.plan;
    return { plan, s: new PlaySession(plan, modeDef('7k').columns, ini, { autoplay }) };
  };
  const run = (plan: ChartPlan, s: PlaySession) => {
    let sounds = 0;
    for (let t = 0; t <= plan.endMs + 1000; t += 5) sounds += s.advance(t).sounds.length;
    return sounds;
  };

  it("autoplay sounds every note and scores what the port's perfect player scores", () => {
    const { plan, s } = setup(true);
    expect(run(plan, s)).toBe(plan.events.length);
    const lanes = modeDef('7k').columns.map((c) => c.track);
    const ref = judgeSim(plan.ezff, ini, lanes, 0, 0, 1);
    expect(s.totalNotes).toBe(ref.totalNotes);
    expect(s.score.counts).toEqual(ref.counts);
    expect(s.score.score).toBe(ref.score);
    expect(s.score.maxCombo).toBe(ref.maxCombo);
    expect(s.score.gauge).toBe(ref.gauge);
    // Kinds 4 and 5 pay one instalment but count by the ladder, and 9-12 pay a
    // head they don't count: the port's own maximum is out of reach here.
    expect(s.score.score).toBeLessThan(s.score.maxFor(s.totalNotes));
    expect(s.finished).toBe(true);
  });

  it('autoplay reaches the maximum and S4 when every hold kind pays what it counts', () => {
    const { plan, s } = setup(true, [0, 1, 2, 3, 6, 7]);
    run(plan, s);
    expect(s.score.score).toBe(s.score.maxFor(s.totalNotes));
    expect(s.score.maxCombo).toBe(s.totalNotes);
    expect(s.score.gradeName(s.score.grade(s.totalNotes))).toBe('S4');
  });

  it('a player who never presses misses everything, silently', () => {
    const { plan, s } = setup(false);
    let laneSounds = 0;
    for (let t = 0; t <= plan.endMs + 1000; t += 5) {
      laneSounds += s.advance(t).sounds.filter((c) => c.voice.startsWith('lane')).length;
    }
    expect(laneSounds).toBe(0);
    expect(s.score.counts[J.MISS]).toBeGreaterThan(0);
    expect(s.score.failed).toBe(true);
  });

  it('a press between notes still sounds the nearer one, and a stray is not judged', () => {
    const { s } = setup(false);
    s.advance(10);
    const r = s.press(1, 10); // lane 1 (key 1) - its first note is at 0.4 s
    expect(r.sounds).toHaveLength(1);
    expect(r.sounds[0]!.voice).toBe('lane1');
    expect(r.fx).toEqual([]);
  });
});
