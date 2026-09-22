// Change a chart's resolution, moving everything that is measured in pulses.
//
// BmsTWO's version forgot STOPs and BGA (Document::ConvertResolutionInternal,
// "TODO: Stop Events", "TODO: BGA data"); this one moves notes (by their start
// and end, so a hold keeps its end), BPM events, STOPs, bar lines and every
// BGA event, and reports the worst rounding in new pulses.

import type { ChartData } from '../model/types';

export interface RescaleReport {
  /** Largest |exact - rounded| in new pulses; 0 when the scale is exact. */
  worstError: number;
  changed: number;
}

export function rescaleChart(chart: ChartData, newResolution: number): RescaleReport {
  const oldRes = chart.info.resolution && chart.info.resolution > 0 ? chart.info.resolution : 240;
  if (!(newResolution > 0) || !Number.isInteger(newResolution)) {
    throw new Error(`resolution must be a positive integer, got ${newResolution}`);
  }
  const k = newResolution / oldRes;
  const report: RescaleReport = { worstError: 0, changed: 0 };
  const conv = (y: number): number => {
    const exact = y * k;
    const r = Math.round(exact);
    report.worstError = Math.max(report.worstError, Math.abs(exact - r));
    if (r !== y) report.changed++;
    return r;
  };
  for (const n of chart.notes) {
    const y = conv(n.y);
    const end = n.l > 0 ? conv(n.y + n.l) : y;
    if (n.xStop !== undefined) n.xStop = conv(n.y + n.xStop) - y;
    n.y = y;
    n.l = end - y;
  }
  for (const e of chart.bpmEvents) e.y = conv(e.y);
  for (const e of chart.stopEvents) {
    const y = conv(e.y);
    e.duration = conv(e.y + e.duration) - y;
    e.y = y;
  }
  for (const l of chart.lines ?? []) l.y = conv(l.y);
  if (chart.bga) {
    for (const e of [...chart.bga.bga, ...chart.bga.layer, ...chart.bga.poor]) e.y = conv(e.y);
  }
  chart.info.resolution = newResolution;
  return report;
}
