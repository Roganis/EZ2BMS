// Columns in screen order for a player side.
//
// P1 draws the mode's lane order left to right; P2 is the full mirror, as
// BmsTWO's P2 skins and the game's 2P panels are (turntable on the right,
// keys 5..1). It is a view setting only: the chart data never changes.

import type { Column, ModeDef } from './registry';

export type Side = 'P1' | 'P2';

export function columnsFor(mode: ModeDef, side: Side): Column[] {
  return side === 'P1' ? mode.columns : [...mode.columns].reverse();
}
