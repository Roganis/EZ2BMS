// Which lane an input channel plays in a mode. EZ2PORT routes a channel to a
// .gds control id (reference/play.c gds_key_for_channel), and the mode's
// .gds says which lane that control drives; EZ2BMS's lanes carry the same ids
// (modes/lanes.ts), so the route is channel -> control id -> lane -> the
// mode's column.
//
// That is why Key6 and Effect1 land on one lane (x 31): the cabinet's sixth
// and seventh keys ARE effector buttons 1 and 2 in 7StreetMix's descriptor, a
// keyboard reaches them either way. And in ScratchMix (reference/play.c
// 2426-2501) the turntable is not a lane at all but the STRUM: its channels
// route to a side's strum instead of a column.

import type { ModeId } from '../modes/ids';
import { laneForSlot } from '../modes/lanes';
import type { Column } from '../modes/registry';
import { KEY_CHANNELS, type KeyChannel } from './keyconf';

/** play.c gds_key_for_channel: the .gds control id a channel raises (-1: none - Start, Test, Service, Coin). */
const GDS_KEY: Partial<Record<KeyChannel, number>> = {
  Key1: 10,
  Key2: 11,
  Key3: 12,
  Key4: 13,
  Key5: 14,
  // The sixth and seventh keys sit below the others (EZ2_GDS_KEY_6/7).
  Key6: 6,
  Key7: 7,
  Scratch1: 15,
  Scratch2: 16,
  Pedal: 17,
  // The effector row is the cabinet's keys 6..9.
  Effect1: 6,
  Effect2: 7,
  Effect3: 8,
  Effect4: 9,
  P2Key1: 18,
  P2Key2: 19,
  P2Key3: 20,
  P2Key4: 21,
  P2Key5: 22,
  P2Key6: 8,
  P2Key7: 9,
  P2Scratch1: 23,
  P2Scratch2: 24,
  P2Pedal: 25,
};

export function gdsKeyForChannel(ch: number): number {
  const name = KEY_CHANNELS[ch];
  return (name && GDS_KEY[name]) ?? -1;
}

/** The canonical lane (bmson x) a channel plays, whatever the mode; undefined for none. */
export function laneForChannel(ch: number): number | undefined {
  return laneForSlot(gdsKeyForChannel(ch))?.x;
}

/** The turntable's channels, and whose they are. */
const STRUM_SIDE: Partial<Record<KeyChannel, 0 | 1>> = {
  Scratch1: 0,
  Scratch2: 0,
  P2Scratch1: 1,
  P2Scratch2: 1,
};

export type ChannelRoute = { column: number } | { strum: 0 | 1 };

/**
 * What a channel does in a mode: a column of `columns` (the mode's, or the
 * game's .gds), a strum for ScratchMix's turntable, or nothing (a lane the
 * mode does not have, Start, Test...).
 */
export function routeChannel(
  mode: ModeId,
  columns: readonly Column[],
  ch: number,
): ChannelRoute | null {
  const name = KEY_CHANNELS[ch];
  if (!name) return null;
  if (mode === 'scratch') {
    const side = STRUM_SIDE[name];
    if (side !== undefined) return { strum: side };
  }
  const x = laneForChannel(ch);
  if (x === undefined) return null;
  const column = columns.findIndex((c) => c.x === x);
  return column < 0 ? null : { column };
}
