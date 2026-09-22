// A chart's judgement windows and gauge rates, as EZ2PORT holds them
// (ez2/songini.c): the .ini's raw values, then the per-mode adjustments and the
// +3 widening the engine applies when a chart loads. Gauge rates are f32, as
// in the engine, so the gauge moves by exactly the same steps.

import type { JudgementDeltas, LifeDeltas } from '../model/types';
import type { ModeId } from '../modes/ids';

export interface SongIni {
  level: number;
  measureScale: number;
  /** Windows in ticks of 1/192 beat. */
  kool: number;
  cool: number;
  good: number;
  miss: number;
  /** Gauge rates (f32). `gaugeMiss` is what a FAIL costs and `gaugeFail` what a MISS costs - the .ini's names. */
  gaugeKool: number;
  gaugeCool: number;
  gaugeGood: number;
  gaugeMiss: number;
  gaugeFail: number;
}

const f = Math.fround;

/** ez2_song_ini_defaults: the values a chart with no .ini gets. */
export function songIniDefaults(): SongIni {
  return {
    level: 99,
    measureScale: f(1.0),
    kool: 6,
    cool: 24,
    good: 36,
    miss: 72,
    gaugeKool: f(0.2),
    gaugeCool: f(0.2),
    gaugeGood: f(0.1),
    gaugeMiss: f(-1.8),
    gaugeFail: f(-4.8),
  };
}

/** The values a published chart's .ini carries. */
export function songIniFrom(level: number, j: JudgementDeltas, l: LifeDeltas): SongIni {
  return {
    level,
    measureScale: f(1.6),
    kool: j.KOOL,
    cool: j.COOL,
    good: j.GOOD,
    miss: j.MISS,
    gaugeKool: f(l.COOL),
    gaugeCool: f(l.COOL),
    gaugeGood: f(l.GOOD),
    gaugeMiss: f(l.MISS),
    gaugeFail: f(l.FAIL),
  };
}

/** EZ2PORT's mode index (ez2/mode.h), which the per-mode adjustments key on. */
export const PORT_MODE_INDEX: Record<ModeId, number> = {
  '5k-only': 0,
  ruby: 1,
  '5k': 2,
  '7k': 3,
  '10k': 4,
  '14k': 5,
  catch: 10,
  scratch: 11,
  andromeda: 13,
};

/** Everything the engine does to a chart's .ini values at load (mode bonus, measure scale, +3). */
export function effectiveIni(raw: SongIni, mode: ModeId): SongIni {
  const s = { ...raw };
  const m = PORT_MODE_INDEX[mode];
  // ez2_song_ini_apply_mode_bonus
  if (m === 5 || m === 9) {
    s.gaugeCool = f(s.gaugeCool + f(0.05));
    s.gaugeKool = f(s.gaugeKool + f(0.05));
    s.gaugeGood = f(s.gaugeGood + f(0.02));
  }
  if (m === 10) s.gaugeGood = 0;
  // ez2_song_ini_apply_measure_scale
  if (m !== 6 && m !== 7 && m !== 8 && m !== 9 && m !== 12) s.measureScale = f(1.6);
  // ez2_song_ini_apply_judge_widening (normal mode: +3)
  s.kool += 3;
  s.cool += 3;
  s.good += 3;
  s.miss += 3;
  return s;
}
