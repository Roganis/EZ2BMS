import { TimingMap, type ChartDoc } from '@ez2bms/chart-core';

/** The chart's tempo map (STOPs included: this is what the charter hears). */
export function chartTiming(doc: ChartDoc): TimingMap {
  const d = doc.data;
  return new TimingMap({
    resolution: doc.resolution,
    initBpm: d.info.initBpm ?? 120,
    bpmEvents: d.bpmEvents,
    stopEvents: d.stopEvents,
  });
}
