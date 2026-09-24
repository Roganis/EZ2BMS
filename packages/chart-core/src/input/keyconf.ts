// keys.ini: which keys and controller inputs drive each of EZ2PORT's input
// channels, and which axis is each turntable. A transcription of EZ2PORT's
// ez2/keyconf.c (third_party/ez2port-core), proven against it by the
// oracle's `keyconf` command (test/input.oracle.test.ts).
//
// EZ2BMS keeps its own bindings (the owner's choice, M7): the player's
// keys.ini is read as the starting point and never written. They are held in
// this same form, so the grammar, the alternates and the defaults are the
// port's, and "Copy as keys.ini" gives text the port reads as it is.
//
//     [Keys]
//     Key1     = Z, 0810:e501/b3      ; up to 4 alternates; the channel is
//                                     ; down while any of them is
//     Key7     = ";"                  ; quoted: ; , # and " are syntax
//     [Analog]
//     Turntable = 0810:e501/a0:rev    ; one binding (see bindspec.ts)
//
// As the C: lines past 511 bytes are cut, a name past 47 bytes is cut, `#`
// starts a comment only at the start of a name (it is part of `vid:pid#2`),
// any section but one containing "nalog" is [Keys], and a file names only the
// channels it changes. Strings are byte strings (see bindspec.ts toBytes).

import { asciiIeq, binaryOf, toBytes } from './bindspec';

/** EZ2PORT's input channels, in its order (keyconf.h's enum, platform.h's EZ_IN_*). */
export const KEY_CHANNELS = [
  'Key1',
  'Key2',
  'Key3',
  'Key4',
  'Key5',
  'Key6',
  'Key7',
  'Scratch1',
  'Scratch2',
  'Pedal',
  'Start',
  'Effect1',
  'Effect2',
  'Effect3',
  'Effect4',
  'P2Key1',
  'P2Key2',
  'P2Key3',
  'P2Key4',
  'P2Key5',
  'P2Key6',
  'P2Key7',
  'P2Scratch1',
  'P2Scratch2',
  'P2Pedal',
  'P2Start',
  'Test',
  'Service',
  'Coin',
] as const;
export type KeyChannel = (typeof KEY_CHANNELS)[number];

/** The two turntables, as written, and the spaced spelling 2EZConfig and lights.ini use. */
export const ANALOG_NAMES = ['Turntable', 'P2Turntable'] as const;
const ANALOG_ALIAS = ['P1 Turntable', 'P2 Turntable'];

export const KEY_ALTS = 4;
const KEY_NAME = 48;
const LINE = 512;

/**
 * The port's default layout (keyconf.c kDefaults, the owner's 2026-08-30
 * choice): Z S X D C V B, the turntable on Left Ctrl/Shift, Space the pedal,
 * F G H J the effectors, player 2 mirrored on the right.
 */
const DEFAULTS: readonly string[] = [
  'Z',
  'S',
  'X',
  'D',
  'C',
  'V',
  'B',
  'Left Ctrl',
  'Left Shift',
  'Space',
  'Return',
  'F',
  'G',
  'H',
  'J',
  'M',
  'K',
  ',',
  'L',
  '.',
  '/',
  ';',
  'Right Ctrl',
  'Right Shift',
  'Right Alt',
  '\\',
  'F1',
  'F2',
  'F3',
];

export interface Keyconf {
  /** Per channel (KEY_CHANNELS order), its bindings: up to 4, each a bindspec token. */
  names: string[][];
  /** Each turntable's binding, '' when it has none (the default). */
  analog: [string, string];
}

export function keyconfDefaults(): Keyconf {
  return { names: DEFAULTS.map((d) => [d]), analog: ['', ''] };
}

/** Nothing bound anywhere (the oracle's `keyconf bare`). */
export function keyconfEmpty(): Keyconf {
  return { names: KEY_CHANNELS.map(() => []), analog: ['', ''] };
}

export function channelFromName(name: string): number {
  return KEY_CHANNELS.findIndex((c) => asciiIeq(c, name));
}

export function analogFromName(name: string): number {
  for (let i = 0; i < ANALOG_NAMES.length; i++)
    if (asciiIeq(ANALOG_NAMES[i]!, name) || asciiIeq(ANALOG_ALIAS[i]!, name)) return i;
  return -1;
}

/** Blanks and tabs at the start; those and line ends at the end. Not comments. */
function clean(s: string): string {
  let a = 0;
  while (s[a] === ' ' || s[a] === '\t') a++;
  let b = s.length;
  while (b > a && ' \t\r\n'.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
}

/**
 * A value's names: comma-separated, quote-aware (inside quotes nothing is a
 * comment or a separator; `;` is SDL's name for the semicolon key), `;` a
 * comment anywhere outside quotes and `#` only where a name starts.
 */
function splitValue(val: string, max: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (out.length < max) {
    let name = '';
    let quoted = false;
    let comma = false;
    let comment = false;
    while (val[i] === ' ' || val[i] === '\t') i++;
    while (i < val.length) {
      const c = val[i]!;
      if (c === '"') {
        quoted = !quoted;
        i++;
        continue;
      }
      if (!quoted) {
        if (c === ';') {
          comment = true;
          break;
        }
        if (c === '#' && name.length === 0) {
          comment = true;
          break;
        }
        if (c === ',') {
          i++;
          comma = true;
          break;
        }
      }
      if (name.length + 1 < KEY_NAME) name += c;
      i++;
    }
    while (name.endsWith(' ') || name.endsWith('\t')) name = name.slice(0, -1);
    if (name) out.push(name);
    if (comment || (!comma && i >= val.length)) break;
  }
  return out;
}

export interface KeyconfParse {
  conf: Keyconf;
  /** Channels and turntables the text set (the C's return value). */
  set: number;
  /** The first line (1-based) that named nothing known; 0 when every line was understood. */
  badLine: number;
}

/**
 * Apply a keys.ini over `base` (the defaults unless given): a channel the
 * text names is replaced - an empty value unbinds it - and the rest keep
 * theirs. Text is taken as UTF-8 (a string) or bytes.
 */
export function parseKeyconf(
  text: string | Uint8Array,
  base: Keyconf = keyconfDefaults(),
): KeyconfParse {
  const bytes = typeof text === 'string' ? toBytes(text) : binaryOf(text);
  const conf: Keyconf = { names: base.names.map((n) => [...n]), analog: [...base.analog] };
  let set = 0;
  let badLine = 0;
  let lineno = 0;
  let inAnalog = false;
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    let line = '';
    while (i < n && bytes[i] !== '\n' && line.length + 1 < LINE) line += bytes[i++];
    while (i < n && bytes[i] !== '\n') i++;
    if (i < n) i++;
    lineno++;
    // A C string ends at its first NUL.
    const nul = line.indexOf('\0');
    if (nul >= 0) line = line.slice(0, nul);

    const p = clean(line);
    if (!p || p[0] === ';' || p[0] === '#') continue;
    if (p[0] === '[') {
      inAnalog = p.includes('nalog') || p.includes('NALOG');
      continue;
    }
    const eq = p.indexOf('=');
    if (eq < 0) {
      if (!badLine) badLine = lineno;
      continue;
    }
    const key = clean(p.slice(0, eq));
    const value = clean(p.slice(eq + 1));
    if (inAnalog) {
      // One physical control: only the first name is kept.
      const which = analogFromName(key);
      if (which < 0) {
        if (!badLine) badLine = lineno;
        continue;
      }
      conf.analog[which] = splitValue(value, KEY_ALTS)[0] ?? '';
      set++;
      continue;
    }
    const ch = channelFromName(key);
    if (ch < 0) {
      if (!badLine) badLine = lineno;
      continue;
    }
    conf.names[ch] = splitValue(value, KEY_ALTS);
    set++;
  }
  return { conf, set, badLine };
}

/** Where the parser would misread a name unquoted. */
const needsQuotes = (v: string) => /[;#,"]/.test(v);

/** keys.ini text in the port's own layout (ez2_keyconf_format), as a byte string. */
export function formatKeyconf(kc: Keyconf): string {
  let out =
    "; EZ2PORT key map - written by the test menu's rebind page.\n" +
    "; The channel names and the quoting rules are ez2/keyconf.h's.\n" +
    '[Keys]\n';
  KEY_CHANNELS.forEach((name, ch) => {
    const vals = (kc.names[ch] ?? []).map((v) => (needsQuotes(v) ? `"${v}"` : v));
    out += `${name} = ${vals.join(', ')}\n`;
  });
  out +=
    '\n; A turntable is an axis (0810:e501/a0, :rev to flip), the mouse\n' +
    '; (mouse/x:8), or `vtt` - the two scratch keys driving a virtual one.\n' +
    '[Analog]\n';
  ANALOG_NAMES.forEach((name, i) => {
    const v = kc.analog[i];
    out += v ? `${name} = ${v}\n` : `;${name} =\n`;
  });
  return out;
}
