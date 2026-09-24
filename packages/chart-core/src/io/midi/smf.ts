// Standard MIDI Files, read for what slicing needs: when each note starts,
// and the tempo map that says when that is. Pitch, length and controllers are
// not needed - a MIDI file here says where to cut a stem (slice/midi.ts), as
// BmsTWO's MIDI import does.
//
// SMF 1.0 (the MIDI Association's spec): an `MThd` chunk (format 0 or 1,
// track count, division), then `MTrk` chunks of delta-timed events with
// running status. A note-on with velocity 0 is a note-off. Tempo is the
// `FF 51` meta event (microseconds a quarter note), 120 BPM until the first;
// in format 1 it is read from every track (by convention the first). A RIFF
// `RMID` wrapper is unwrapped. Format 2 (independent sequences) and SMPTE
// time division have no single tempo map to cut a chart by, and are refused.

import { said } from '../../i18n/say';
import { SaidError } from '../said-error';

export interface SmfNote {
  /** Ticks from the start (division ticks a quarter note). */
  tick: number;
  track: number;
  channel: number;
  key: number;
  velocity: number;
}

export interface SmfTempo {
  tick: number;
  /** Microseconds a quarter note. */
  usPerQuarter: number;
}

export interface SmfTrack {
  name: string;
  notes: number;
  /** MIDI channels its notes are on. */
  channels: number[];
}

export interface Smf {
  format: 0 | 1;
  /** Ticks a quarter note. */
  ppq: number;
  tracks: SmfTrack[];
  /** Every note-on, by tick. */
  notes: SmfNote[];
  /** Tempo changes by tick; one at tick 0 always (120 BPM unless the file says). */
  tempos: SmfTempo[];
}

export class SmfError extends SaidError {}

const DEFAULT_US = 500_000;

export function parseSmf(input: Uint8Array): Smf {
  let bytes = input;
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  // RMID: RIFF....RMIDdata<len><SMF>
  if (tag(0) === 'RIFF' && tag(8) === 'RMID') {
    let p = 12;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (p + 8 <= bytes.length) {
      const len = dv.getUint32(p + 4, true);
      if (tag(p) === 'data') {
        bytes = bytes.subarray(p + 8, p + 8 + len);
        break;
      }
      p += 8 + len + (len & 1);
    }
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 14 || tag(0) !== 'MThd') throw new SmfError(said('midi.not-midi'));
  const hlen = dv.getUint32(4);
  const format = dv.getUint16(8);
  const ntracks = dv.getUint16(10);
  const division = dv.getUint16(12);
  if (format === 2) throw new SmfError(said('midi.format-2'));
  if (format > 2) throw new SmfError(said('midi.format', { format }));
  if (division & 0x8000) throw new SmfError(said('midi.smpte'));
  if (!division) throw new SmfError(said('midi.division'));
  const smf: Smf = { format: format as 0 | 1, ppq: division, tracks: [], notes: [], tempos: [] };
  let p = 8 + hlen;
  for (let t = 0; t < ntracks && p + 8 <= bytes.length; t++) {
    const len = dv.getUint32(p + 4);
    const kind = tag(p);
    const start = p + 8;
    const end = Math.min(bytes.length, start + len);
    p = start + len;
    if (kind !== 'MTrk') {
      t--; // an unknown chunk is skipped, not counted
      continue;
    }
    readTrack(bytes.subarray(start, end), smf.tracks.length, smf);
  }
  smf.notes.sort((a, b) => a.tick - b.tick || a.track - b.track || a.key - b.key);
  smf.tempos.sort((a, b) => a.tick - b.tick);
  // One tempo per tick (the last read wins), and one at tick 0.
  const byTick = new Map<number, number>();
  for (const x of smf.tempos) byTick.set(x.tick, x.usPerQuarter);
  if (!byTick.has(0)) byTick.set(0, DEFAULT_US);
  smf.tempos = [...byTick]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, usPerQuarter]) => ({ tick, usPerQuarter }));
  return smf;
}

function readTrack(b: Uint8Array, index: number, smf: Smf): void {
  const track: SmfTrack = { name: '', notes: 0, channels: [] };
  const channels = new Set<number>();
  let p = 0;
  let tick = 0;
  let status = 0;
  const vlq = () => {
    let v = 0;
    for (let i = 0; i < 4 && p < b.length; i++) {
      const c = b[p++]!;
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  };
  while (p < b.length) {
    tick += vlq();
    if (p >= b.length) break;
    let s = b[p]!;
    if (s & 0x80) p++;
    else if (status)
      s = status; // running status
    else break; // data with no status: the track is broken from here
    if (s === 0xff) {
      const type = b[p++]!;
      const len = vlq();
      const data = b.subarray(p, p + len);
      p += len;
      if (type === 0x2f) break; // end of track
      if (type === 0x51 && len === 3) {
        smf.tempos.push({ tick, usPerQuarter: (data[0]! << 16) | (data[1]! << 8) | data[2]! });
      } else if (type === 0x03 && !track.name) {
        track.name = new TextDecoder('latin1').decode(data);
      }
      continue;
    }
    if (s === 0xf0 || s === 0xf7) {
      // Sysex. (Not `p += vlq()`: that adds to p as it was before vlq moved it.)
      const len = vlq();
      p += len;
      continue;
    }
    status = s;
    const kind = s & 0xf0;
    const ch = s & 0x0f;
    const d1 = b[p++] ?? 0;
    const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : (b[p++] ?? 0);
    if (kind === 0x90 && d2 > 0) {
      smf.notes.push({ tick, track: index, channel: ch, key: d1, velocity: d2 });
      track.notes++;
      channels.add(ch);
    }
  }
  track.channels = [...channels].sort((a, c) => a - c);
  smf.tracks.push(track);
}

/** Milliseconds from the start at a tick, through the tempo map. */
export function smfMs(smf: Smf, tick: number): number {
  let ms = 0;
  const t = smf.tempos;
  for (let i = 0; i < t.length; i++) {
    const from = t[i]!.tick;
    if (from >= tick) break;
    const to = Math.min(tick, t[i + 1]?.tick ?? tick);
    ms += ((to - from) * t[i]!.usPerQuarter) / smf.ppq / 1000;
  }
  return ms;
}

/** BPM of a tempo event. */
export const smfBpm = (t: SmfTempo) => 60_000_000 / t.usPerQuarter;
