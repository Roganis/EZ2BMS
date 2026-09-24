// EZ2PORT's synthetic player (tools/ez2judge.c): every lane note pressed at
// its own time plus an offset and a deterministic jitter, holds held to the
// end. The same RNG and the same order, so the numbers match the port's tool
// exactly - which makes it both an oracle test and a quick "how does this
// chart grade at +20 ms?" report.

import type { EzffChart } from '../io/ez/ezff';
import { EZ_NOTE, holdTicksOf } from '../io/ez/ezff';
import { EngineTempo } from '../timing/engine-tempo';
import { J, holdInstalments, judgeMs, noteCounted, Score } from './score';
import type { SongIni } from './songini';

export interface JudgeSimResult {
  totalNotes: number;
  holds: number;
  instalments: number;
  backing: number;
  counts: number[];
  maxCombo: number;
  score: number;
  max: number;
  gauge: number;
  failed: boolean;
  rate: number;
  grade: string;
}

export function judgeSim(
  chart: EzffChart,
  ini: SongIni,
  laneTracks: readonly number[],
  offsetMs: number,
  jitterMs: number,
  seed: number,
): JudgeSimResult {
  let rng = seed >>> 0;
  const jitter = (amp: number) => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return (((rng >>> 8) / 16777216.0) * 2.0 - 1.0) * amp;
  };
  const bpms = chart.tracks.flatMap((t) =>
    t.records.filter((r) => r.type === 3).map((r) => ({ tick: r.tick, bpm: r.bpm! })),
  );
  const tempo = new EngineTempo(chart.bpm, bpms, chart.ticksPerMeasure);
  const lanes = new Set(laneTracks);
  const sc = new Score();
  let total = 0;
  let holds = 0;
  let inst = 0;
  let backing = 0;
  chart.tracks.forEach((t, ti) => {
    for (const e of t.records) {
      if (e.type !== EZ_NOTE) continue;
      if (!lanes.has(ti)) {
        backing++;
        continue;
      }
      total += noteCounted(e.kind ?? 0, chart.ticksPerMeasure, e.length ?? 0, 0);
      const dt = offsetMs + (jitterMs > 0 ? jitter(jitterMs) : 0);
      let v = judgeMs(dt, tempo.bpmAt(e.tick), ini);
      if (v === J.NONE) v = J.MISS;
      sc.apply(v, ini);
      const hold = holdTicksOf(e);
      if (hold && v !== J.MISS) {
        const n = holdInstalments(e.kind ?? 0, chart.ticksPerMeasure, hold + 6, 0);
        const g = v === J.COOL ? J.KOOL : v;
        holds++;
        inst += n;
        if (e.kind === 6) {
          if (g === J.KOOL) sc.apply(g, ini);
        } else {
          for (let k = 0; k < n; k++) sc.apply(g, ini);
        }
      }
    }
  });
  return {
    totalNotes: total,
    holds,
    instalments: inst,
    backing,
    counts: [...sc.counts],
    maxCombo: sc.maxCombo,
    score: sc.score,
    max: sc.maxFor(total),
    gauge: sc.gauge,
    failed: sc.failed,
    rate: sc.rate(total),
    grade: sc.gradeName(sc.grade(total)),
  };
}
