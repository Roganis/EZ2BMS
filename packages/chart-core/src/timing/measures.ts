// Where a pulse is, in the units a charter reads.
//
// EZ2 has no meter changes: the engine draws a measure line every 192 ticks
// from tick 0 (EZ2PORT tools/ez2play/play.c) whatever bmson `lines` say, so
// EZ2BMS labels positions in 4/4 measures too. The sub-beat unit is the EZ2
// tick (1/48 beat), so a label reads the same in the editor and the engine.

import { TICKS_PER_BEAT } from './ticks';

export const BEATS_PER_MEASURE = 4;

export interface Position {
  /** 0-based measure. */
  measure: number;
  /** 0-based beat inside the measure. */
  beat: number;
  /** EZ2 ticks (1/48 beat) inside the beat, fractional when off-grid. */
  tick: number;
}

export function positionOf(y: number, resolution: number): Position {
  const beatF = y / resolution;
  const beatIndex = Math.floor(beatF);
  const measure = Math.floor(beatIndex / BEATS_PER_MEASURE);
  const beat = beatIndex - measure * BEATS_PER_MEASURE;
  const tick = (beatF - beatIndex) * TICKS_PER_BEAT;
  return {
    measure,
    beat,
    tick: Math.abs(tick - Math.round(tick)) < 1e-9 ? Math.round(tick) : tick,
  };
}

/** "012:3:24" - three-digit measure, beat 1-based for reading, tick. */
export function formatPosition(p: Position): string {
  const t = Number.isInteger(p.tick) ? String(p.tick).padStart(2, '0') : p.tick.toFixed(2);
  return `${String(p.measure).padStart(3, '0')}:${p.beat + 1}:${t}`;
}

export function measureStart(measure: number, resolution: number): number {
  return measure * BEATS_PER_MEASURE * resolution;
}

/** "1:23.456" */
export function formatSeconds(sec: number): string {
  const sign = sec < 0 ? '-' : '';
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${sign}${m}:${rest.toFixed(3).padStart(6, '0')}`;
}
