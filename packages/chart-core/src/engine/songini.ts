// A chart's judgement windows and gauge rates, as EZ2PORT holds them
// (ez2/songini.c): the .ini's raw values, then the per-mode adjustments and the
// +3 widening the engine applies when a chart loads. Gauge rates are f32, as
// in the engine, so the gauge moves by exactly the same steps.

import { atof, ciEq, strtolInt } from '../ez2data/initext';
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

/** A chart .ini as read: the values, and which sections it had. */
export interface ParsedSongIni extends SongIni {
  hadGeneral: boolean;
  hadJudgment: boolean;
  hadGauge: boolean;
}

/** ez2_trim: blanks, tabs and line ends only (not \v or \f, unlike isspace). */
const trim = (s: string) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
const unquote = (s: string) =>
  s.length >= 2 && s[0] === '"' && s.at(-1) === '"' ? s.slice(1, -1) : s;

/**
 * ez2_song_ini_parse, byte for byte (decrypted text; the cipher is
 * ez2data/crypt.ts): lines split at LF and cut to the port's 511-byte buffer,
 * `;` lines skipped, `[General] Level/MeasureScale`, `[JudgmentDelta]
 * Kool/Cool/Good/Miss` (ticks), `[GaugeUpDownRate] Cool/Good/Miss/Fail` with
 * Cool mirrored into KOOL; section and key names in any case, quotes
 * stripped. Anything missing keeps its default - level 99 among them, which
 * is what the game uses when there is no file at all.
 */
export function parseSongIni(bytes: Uint8Array): ParsedSongIni {
  const out: ParsedSongIni = {
    ...songIniDefaults(),
    hadGeneral: false,
    hadJudgment: false,
    hadGauge: false,
  };
  let section = '';
  let pos = 0;
  while (pos < bytes.length) {
    let end = bytes.indexOf(0x0a, pos);
    if (end < 0) end = bytes.length;
    // The C string stops at a NUL too.
    let raw = bytes.subarray(pos, Math.min(end, pos + 511));
    const nul = raw.indexOf(0);
    if (nul >= 0) raw = raw.subarray(0, nul);
    pos = end + 1;
    const line = trim(String.fromCharCode(...raw));
    if (!line || line[0] === ';') continue;
    if (line[0] === '[') {
      const close = line.indexOf(']');
      if (close >= 0) {
        section = trim(line.slice(1, close).slice(0, 63));
        if (ciEq(section, 'General')) out.hadGeneral = true;
        else if (ciEq(section, 'JudgmentDelta')) out.hadJudgment = true;
        else if (ciEq(section, 'GaugeUpDownRate')) out.hadGauge = true;
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = unquote(trim(line.slice(0, eq)));
    const val = unquote(trim(line.slice(eq + 1)));
    if (ciEq(section, 'General')) {
      if (ciEq(key, 'Level')) out.level = strtolInt(val);
      else if (ciEq(key, 'MeasureScale')) out.measureScale = f(atof(val));
    } else if (ciEq(section, 'JudgmentDelta')) {
      const ticks = strtolInt(val);
      if (ciEq(key, 'Kool')) out.kool = ticks;
      else if (ciEq(key, 'Cool')) out.cool = ticks;
      else if (ciEq(key, 'Good')) out.good = ticks;
      else if (ciEq(key, 'Miss')) out.miss = ticks;
    } else if (ciEq(section, 'GaugeUpDownRate')) {
      const v = f(atof(val));
      if (ciEq(key, 'Cool')) {
        out.gaugeCool = v;
        out.gaugeKool = v; // there is no Kool key: KOOL's rate is COOL's
      } else if (ciEq(key, 'Good')) out.gaugeGood = v;
      else if (ciEq(key, 'Miss')) out.gaugeMiss = v;
      else if (ciEq(key, 'Fail')) out.gaugeFail = v;
    }
  }
  return out;
}

/** The bmson deltas a chart .ini gives (songIniFrom's inverse, so a re-publish writes the same .ini). */
export function deltasOfIni(ini: SongIni): { judgement: JudgementDeltas; life: LifeDeltas } {
  return {
    judgement: { KOOL: ini.kool, COOL: ini.cool, GOOD: ini.good, MISS: ini.miss },
    life: { COOL: ini.gaugeCool, GOOD: ini.gaugeGood, MISS: ini.gaugeMiss, FAIL: ini.gaugeFail },
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
