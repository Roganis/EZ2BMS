// Snap grids, limited to what an EZ2 chart can hold.
//
// A grid is named like BMS editors name them: "1/16" means sixteen divisions
// of a 4/4 measure. EZFF stores 48 ticks to the beat, so only divisions of the
// beat that divide 48 survive publishing exactly - 1/4 up to 1/192 including
// the triplet grids 1/12, 1/24, 1/48, 1/96. Anything finer would be rounded by
// the engine, so the editor does not offer it.

import { TICKS_PER_BEAT } from './ticks';

export interface SnapGrid {
  /** Divisions of a 4/4 measure. */
  perMeasure: number;
  label: string;
  triplet: boolean;
}

export const SNAP_GRIDS: readonly SnapGrid[] = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192].map(
  (perMeasure) => ({
    perMeasure,
    label: `1/${perMeasure}`,
    triplet: perMeasure % 3 === 0,
  }),
);

/** Pulses per grid step, or undefined when the resolution cannot hold the grid exactly. */
export function stepPulses(grid: SnapGrid, resolution: number): number | undefined {
  const step = (resolution * 4) / grid.perMeasure;
  return Number.isInteger(step) ? step : undefined;
}

/** Grids the chart's resolution can represent exactly. */
export function gridsFor(resolution: number): SnapGrid[] {
  return SNAP_GRIDS.filter((g) => stepPulses(g, resolution) !== undefined);
}

export function snapDown(y: number, step: number): number {
  return Math.floor(y / step) * step;
}

export function snapNearest(y: number, step: number): number {
  return Math.round(y / step) * step;
}

/** Whether a resolution holds every EZ2 tick exactly (e.g. 240, 480, 48). */
export function isTickExactResolution(resolution: number): boolean {
  return Number.isInteger(resolution / TICKS_PER_BEAT);
}
