// `.gds` - a mode's descriptor: which chart track plays in which lane, and
// which input keys drive it. Plain text, not encrypted, one per mode under
// system/<mode>/ (EZ2PORT docs/gds-slots.md, ez2/gds.c).
//
// Entries are read SEQUENTIALLY: file order is lane order, and the N in
// `TrackN` is never used. A `Key=` then a `SongTrack=` make one lane; a Key
// without a SongTrack contributes nothing. Two keys on one lane
// (`Key=15,16`) are the turntable's two directions.

import { said, sayText } from '../i18n/say';
import { ciEq, strtol } from './initext';

export interface GdsLane {
  /** Input control id, or -1. */
  key: number;
  /** Second control id for the same lane (turntable), or -1. */
  key2: number;
  /** The chart track this lane plays. */
  track: number;
}

export interface GdsSlot {
  /** NumberOfTrack as written. */
  declared: number;
  lanes: GdsLane[];
}

export interface Gds {
  slotCount: number;
  maxBaseStage: number;
  maxBonusStage: number;
  useChainPlay: number;
  /** [Slot1] is player 1, [Slot2] player 2. */
  slots: GdsSlot[];
}

/** Why a .gds cannot be read, in the language chosen. */
export class GdsError extends Error {}

const MAX_SLOTS = 4;
const MAX_TRACKS = 32;

function startsCi(line: string, word: string): boolean {
  return ciEq(line.slice(0, word.length), word);
}

function valueInt(line: string, def: number): number {
  const eq = line.indexOf('=');
  return eq < 0 ? def : strtol(line.slice(eq + 1, eq + 1 + 63));
}

function valuePair(line: string): [number, number] {
  const eq = line.indexOf('=');
  if (eq < 0) return [-1, -1];
  const rest = line.slice(eq + 1, eq + 1 + 127);
  const comma = rest.indexOf(',');
  return [strtol(rest), comma < 0 ? -1 : strtol(rest.slice(comma + 1))];
}

export function parseGds(text: string): Gds {
  const out: Gds = { slotCount: 0, maxBaseStage: 0, maxBonusStage: 0, useChainPlay: 0, slots: [] };
  let slot: GdsSlot | undefined;
  let pending: [number, number] = [-1, -1];
  let haveKey = false;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[ \t]+/, '').replace(/[\r \t]+$/, '');
    if (!line) continue;
    if (line[0] === '[' && line.length >= 2) {
      slot = undefined;
      haveKey = false;
      if (line.length >= 6 && startsCi(line.slice(1), 'Slot')) {
        const si = strtol(line.slice(5)) - 1;
        if (si >= 0 && si < MAX_SLOTS) {
          while (out.slots.length <= si) out.slots.push({ declared: 0, lanes: [] });
          slot = out.slots[si];
        }
      }
      continue;
    }
    if (!slot) {
      if (startsCi(line, 'NumberOfSlot')) out.slotCount = valueInt(line, 0);
      else if (startsCi(line, 'MaxBaseStage')) out.maxBaseStage = valueInt(line, 0);
      else if (startsCi(line, 'MaxBonusStage')) out.maxBonusStage = valueInt(line, 0);
      else if (startsCi(line, 'UseChainPlay')) out.useChainPlay = valueInt(line, 0);
      continue;
    }
    if (startsCi(line, 'NumberOfTrack')) {
      slot.declared = valueInt(line, 0);
    } else if (startsCi(line, 'Key') && !startsCi(line, 'Keys')) {
      pending = valuePair(line);
      haveKey = true;
    } else if (startsCi(line, 'SongTrack')) {
      if (slot.lanes.length < MAX_TRACKS) {
        slot.lanes.push({
          key: haveKey ? pending[0] : -1,
          key2: haveKey ? pending[1] : -1,
          track: valueInt(line, -1),
        });
      }
      haveKey = false;
    }
  }
  if (!out.slots.length) throw new GdsError(sayText(said('data.gds.no-slot')));
  return out;
}

/** The lane (index) a control id drives for a player, or -1. */
export function gdsLaneForKey(g: Gds, player: number, key: number): number {
  const s = g.slots[player];
  if (!s || key < 0) return -1;
  return s.lanes.findIndex((l) => l.key === key || l.key2 === key);
}
