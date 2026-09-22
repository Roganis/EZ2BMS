import type { LaneKind } from '@ez2bms/chart-core';

/** The lane kinds' colours, for DOM previews (the playfield has its own). */
export const KIND_CSS: Record<LaneKind, string> = {
  white: '#f2f2ff',
  blue: '#4d9eff',
  scratch: '#ed2e2e',
  pedal: '#ffd11f',
  effector: '#ff5a9e',
};
