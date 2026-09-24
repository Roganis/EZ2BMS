// `.ezi` - a chart's keysound index: which sample each note key plays.
//
// Read exactly as EZ2PORT reads it (ez2/ezi.c, itself a transcription of the
// original's EziLoader::loadEZI): scanf-style tokens, `<note> <mode> <file>`
// with a second file on a mode-2 line (read and ignored by the game), a `;`
// comment skipping a PAIR of tokens rather than a line, a later line for the
// same note winning, a trailing token with no mode ending the parse, and a
// note outside the table rejecting the whole file. Names are bytes, cut where
// the port's buffers cut them, and CP949 like the game's other text.
//
// One deliberate difference, off by default for the parity tests and on for
// imports: old charts name their notes like MIDI keys - `C#0 1 mix-st.wav` -
// which the port (like the original's atol) reads as note 0 every time, so
// every such line lands on one slot. Read as octave * 12 + semitone they
// give each note of the sibling .ez its own sample (docs/ez2port-compat.md).

import { decodeCp949, strtolInt } from '../../ez2data/initext';
import { said, type Said } from '../../i18n/say';
import { SaidError } from '../said-error';

export interface EziEntry {
  /** The chart's key index. */
  note: number;
  mode: number;
  /** The file as written (".wav"; the game's is ".ssf", eziResolve). */
  name: string;
  /** A mode-2 line's second file (the game ignores it). */
  name2?: string;
  /** The note name a legacy line gave its index by (`C#0`), when read as one. */
  noteName?: string;
}

export interface Ezi {
  entries: EziEntry[];
  /** Lines whose note was a legacy note name. */
  legacy: number;
}

export class EziError extends SaidError {
  constructor(
    readonly code: 'note' | 'empty',
    what: Said,
  ) {
    super(what);
  }
}

/** ez2/ezi.h EZ2_EZI_SLOTS: the port's table is as wide as a v8 note's u16 key. */
export const EZI_SLOTS = 0x10000;
/** The original executable's table (ezi.h EZ2_EZI_SLOTS_ORIGINAL). */
export const EZI_SLOTS_ORIGINAL = 0x800;
/** scanf buffers in ez2_ezi_parse: tokens 64 bytes, names EZ2_EZI_NAME (260). */
const TOKEN = 64;
const NAME = 260;

const SEMITONE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A legacy note name's index: `C0` 0, `C#0` 1 ... `B0` 11, `C1` 12. */
export function legacyNoteIndex(token: string): number | undefined {
  const m = /^([A-Ga-g])(#?)(\d{1,4})$/.exec(token);
  if (!m) return undefined;
  return Number(m[3]) * 12 + SEMITONE[m[1]!.toLowerCase()]! + (m[2] ? 1 : 0);
}

const isSpace = (c: number) => c === 0x20 || (c >= 0x09 && c <= 0x0d);

export function parseEzi(bytes: Uint8Array, opts: { legacyNames?: boolean } = {}): Ezi {
  let pos = 0;
  const n = bytes.length;
  /** The next token, cut to `size - 1` bytes, or undefined at the end. */
  const next = (size: number): Uint8Array | undefined => {
    while (pos < n && isSpace(bytes[pos]!)) pos++;
    if (pos >= n) return undefined;
    const from = pos;
    while (pos < n && !isSpace(bytes[pos]!)) pos++;
    return bytes.subarray(from, Math.min(pos, from + size - 1));
  };
  const latin = (b: Uint8Array) => String.fromCharCode(...b);
  const out: Ezi = { entries: [], legacy: 0 };
  for (;;) {
    const token = next(TOKEN);
    if (!token) break;
    const modeToken = next(TOKEN);
    if (!modeToken) break;
    if (token[0] === 0x3b) continue; // ';' - skips this token and the next
    const t = latin(token);
    const legacy = opts.legacyNames ? legacyNoteIndex(t) : undefined;
    const note = legacy ?? strtolInt(t);
    if (note < 0 || note >= EZI_SLOTS) {
      throw new EziError('note', said('ez.ezi.note', { note: t, max: EZI_SLOTS - 1 }));
    }
    const mode = strtolInt(latin(modeToken));
    const name = next(NAME);
    if (!name) break; // a truncated last line
    const e: EziEntry = { note, mode, name: decodeCp949(name) };
    if (legacy !== undefined) {
      e.noteName = t;
      out.legacy++;
    }
    if (mode === 2) {
      const name2 = next(NAME);
      if (name2) e.name2 = decodeCp949(name2);
    }
    out.entries.push(e);
  }
  if (!out.entries.length) throw new EziError('empty', said('ez.ezi.empty'));
  return out;
}

/** Note -> entry, a later line for the same note winning (ez2_ezi_lookup). */
export function eziTable(ezi: Ezi): Map<number, EziEntry> {
  const m = new Map<number, EziEntry>();
  for (const e of ezi.entries) m.set(e.note, e);
  return m;
}

/**
 * The file on disk for a name (ez2_ezi_resolve): any three-letter extension
 * becomes ".ssf". The result may be a relative path into another song's
 * folder (`..\..\sound\stay\p_MR.wav`), resolved against the .ezi's folder.
 */
export function eziResolve(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || name.length - dot !== 4) return name;
  return `${name.slice(0, dot + 1)}ssf`;
}
