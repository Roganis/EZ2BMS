// BMS text -> headers and object lines, with the control flow resolved.
//
// The format is the BMS command memo's (hitkey.nekokan.dyndns.info/cmds.htm)
// as LR2, beatoraja (jbms-parser BMSDecoder) and BmsTWO read it:
//
// - `#KEY value` headers; `#WAVxx`/`#BMPxx`/`#BPMxx`/`#EXBPMxx`/`#STOPxx`
//   definitions, `xx` base 36 (case-insensitive) or base 62 after `#BASE 62`
//   (case-sensitive; read before anything else, as beatoraja does);
// - `#mmmCC:data` object lines: measure mmm, channel CC, then two characters
//   per slot, `00` empty. A channel written twice in a measure is merged, a
//   later line's object winning a slot (BGM, channel 01, keeps every line);
// - control flow, nested: `#RANDOM n`/`#SETRANDOM n` choose 1..n,
//   `#IF`/`#ELSEIF`/`#ELSE`/`#ENDIF` pick lines by it, `#ENDRANDOM` closes;
//   `#SWITCH n`/`#SETSWITCH n` with `#CASE`/`#DEF`/`#SKIP`/`#ENDSW` fall
//   through like C's switch. Which value a `#RANDOM` takes is the caller's
//   (`pick`), so an import can show every random block and let you choose;
//   by default each takes 1. A missing `#ENDIF` before the next `#IF` of the
//   same random is closed for it (a common slip), and said.

import { said, sayEnglish, type Said } from '../../i18n/say';

export interface BmsLine {
  measure: number;
  /** Two characters, upper-case. */
  channel: string;
  /** Slot ids ('00' empty), as the base reads them. */
  slots: string[];
  /** 1-based line number. */
  line: number;
}

export interface BmsRandom {
  line: number;
  max: number;
  /** The value it took (0: in a branch not taken, so never rolled). */
  value: number;
  /** A #SETRANDOM (fixed by the file). */
  fixed: boolean;
}

export interface BmsDoc {
  /** Plain headers by upper-case name (the last one wins): TITLE, BPM, PLAYLEVEL... */
  headers: Map<string, string>;
  wav: Map<string, string>;
  bmp: Map<string, string>;
  bpm: Map<string, number>;
  stop: Map<string, number>;
  base: 36 | 62;
  lnobj: Set<string>;
  lntype: number;
  /** #mmm02: the measure's length in 4/4 measures, as written. */
  measureLength: Map<number, string>;
  lines: BmsLine[];
  randoms: BmsRandom[];
  /** Problems with a line, in English; `said` says each in the language chosen (i18n/say.ts). */
  warnings: { line: number; message: string; said?: Said }[];
}

export interface BmsParseOptions {
  /** The value (1..max) the index-th #RANDOM takes; default 1. */
  pick?: (max: number, index: number) => number;
}

type Frame =
  | { kind: 'random'; value: number }
  | { kind: 'if'; active: boolean; taken: boolean }
  | { kind: 'switch'; value: number; active: boolean; matched: boolean; skipped: boolean };

const DEFS = ['WAV', 'BMP', 'BPM', 'EXBPM', 'STOP'] as const;

export function parseBms(text: string, opts: BmsParseOptions = {}): BmsDoc {
  const doc: BmsDoc = {
    headers: new Map(),
    wav: new Map(),
    bmp: new Map(),
    bpm: new Map(),
    stop: new Map(),
    base: 36,
    lnobj: new Set(),
    lntype: 1,
    measureLength: new Map(),
    lines: [],
    randoms: [],
    warnings: [],
  };
  const rawLines = text.split(/\r\n|\r|\n/);
  // #BASE first: it decides how every id is read, wherever it is written.
  for (const l of rawLines) {
    const m = /^\s*#BASE\s+(\d+)/i.exec(l);
    if (m && m[1] === '62') doc.base = 62;
  }
  const id = (s: string) => (doc.base === 62 ? s : s.toUpperCase());
  const warn = (line: number, s: Said) =>
    doc.warnings.push({ line, message: sayEnglish(s), said: s });
  const stack: Frame[] = [];
  const active = () =>
    stack.every((f) => (f.kind === 'if' ? f.active : f.kind === 'switch' ? f.active : true));
  const topRandom = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      if (f.kind === 'random') return f;
    }
    return undefined;
  };
  const merged = new Map<string, BmsLine>();
  const pick = opts.pick ?? (() => 1);

  rawLines.forEach((raw, i) => {
    const n = i + 1;
    const l = raw.trim();
    if (l[0] !== '#') return;
    const sp = l.search(/\s/);
    const word = (sp < 0 ? l.slice(1) : l.slice(1, sp)).toUpperCase();
    const arg = sp < 0 ? '' : l.slice(sp).trim();
    const num = () => Number.parseInt(arg, 10);

    // Control flow, whether or not this branch is taken (to keep the nesting).
    switch (word) {
      case 'RANDOM':
      case 'SETRANDOM': {
        const max = num();
        const on = active();
        let value = 0;
        if (on && Number.isFinite(max) && max >= 1) {
          if (word === 'SETRANDOM') value = max;
          else {
            const v = Math.round(pick(max, doc.randoms.length));
            value = Math.min(max, Math.max(1, v));
          }
          doc.randoms.push({ line: n, max, value, fixed: word === 'SETRANDOM' });
        } else if (on) warn(n, said('bms.random-number', { header: `#${word}` }));
        stack.push({ kind: 'random', value });
        return;
      }
      case 'IF': {
        const r = topRandom();
        if (!r) {
          warn(n, said('bms.if-no-random'));
          stack.push({ kind: 'if', active: false, taken: true });
          return;
        }
        if (stack.at(-1)?.kind === 'if') {
          warn(n, said('bms.if-open'));
          stack.pop();
        }
        const on = r.value !== 0 && r.value === num();
        stack.push({ kind: 'if', active: on, taken: on });
        return;
      }
      case 'ELSEIF': {
        const f = stack.at(-1);
        if (f?.kind !== 'if') return warn(n, said('bms.elseif'));
        const r = topRandom();
        f.active = !f.taken && !!r && r.value !== 0 && r.value === num();
        f.taken ||= f.active;
        return;
      }
      case 'ELSE': {
        const f = stack.at(-1);
        if (f?.kind !== 'if') return warn(n, said('bms.else'));
        f.active = !f.taken;
        f.taken = true;
        return;
      }
      case 'ENDIF':
      case 'END': {
        if (word === 'END' && !/^IF\b/i.test(arg)) break;
        const at = stack.map((f) => f.kind).lastIndexOf('if');
        if (at < 0) return warn(n, said('bms.endif'));
        stack.length = at;
        return;
      }
      case 'ENDRANDOM': {
        const at = stack.map((f) => f.kind).lastIndexOf('random');
        if (at < 0) return warn(n, said('bms.endrandom'));
        stack.length = at;
        return;
      }
      case 'SWITCH':
      case 'SETSWITCH': {
        const max = num();
        let value = 0;
        if (active() && Number.isFinite(max) && max >= 1) {
          value =
            word === 'SETSWITCH'
              ? max
              : Math.min(max, Math.max(1, Math.round(pick(max, doc.randoms.length))));
          doc.randoms.push({ line: n, max, value, fixed: word === 'SETSWITCH' });
        }
        stack.push({ kind: 'switch', value, active: false, matched: false, skipped: false });
        return;
      }
      case 'CASE':
      case 'DEF': {
        const f = stack.at(-1);
        if (f?.kind !== 'switch') return warn(n, said('bms.case', { header: `#${word}` }));
        if (f.skipped) return;
        // Falls through: once a case matched, the ones after it run too, until #SKIP.
        if (f.matched || (word === 'DEF' ? f.value !== 0 : f.value !== 0 && f.value === num())) {
          f.active = f.matched = true;
        }
        return;
      }
      case 'SKIP': {
        const f = stack.at(-1);
        if (f?.kind !== 'switch') return warn(n, said('bms.skip'));
        if (f.active) {
          f.active = false;
          f.skipped = true;
        }
        return;
      }
      case 'ENDSW':
      case 'ENDSWITCH': {
        const at = stack.map((f) => f.kind).lastIndexOf('switch');
        if (at < 0) return warn(n, said('bms.endsw'));
        stack.length = at;
        return;
      }
    }
    if (!active()) return;

    // An object line: #mmmCC:data
    const obj = /^#(\d{3})([0-9A-Za-z]{2}):(.*)$/.exec(l);
    if (obj) {
      const measure = Number(obj[1]);
      const channel = obj[2]!.toUpperCase();
      const data = obj[3]!.replace(/\s+/g, '');
      if (channel === '02') {
        doc.measureLength.set(measure, data);
        return;
      }
      const slots: string[] = [];
      for (let k = 0; k + 1 < data.length; k += 2) slots.push(id(data.slice(k, k + 2)));
      if (data.length % 2) warn(n, said('bms.odd', { object: `#${obj[1]}${channel}` }));
      const key = `${measure}:${channel}`;
      const prev = merged.get(key);
      // BGM keeps every line (each is a column of its own); anything else merges.
      if (channel === '01' || !prev) {
        const line: BmsLine = { measure, channel, slots, line: n };
        doc.lines.push(line);
        if (channel !== '01') merged.set(key, line);
      } else prev.slots = mergeSlots(prev.slots, slots);
      return;
    }

    // Definitions: #WAVxx, #BMPxx, #BPMxx / #EXBPMxx, #STOPxx.
    for (const d of DEFS) {
      if (word.length === d.length + 2 && word.startsWith(d)) {
        const key = id((sp < 0 ? l.slice(1) : l.slice(1, sp)).slice(d.length));
        if (d === 'WAV') doc.wav.set(key, arg);
        else if (d === 'BMP') doc.bmp.set(key, arg);
        else if (d === 'BPM' || d === 'EXBPM') {
          const v = Number.parseFloat(arg);
          if (Number.isFinite(v)) doc.bpm.set(key, v);
          else warn(n, said('bms.not-number', { header: `#${word}` }));
        } else {
          const v = Number.parseFloat(arg);
          if (Number.isFinite(v)) doc.stop.set(key, v);
          else warn(n, said('bms.not-number', { header: `#${word}` }));
        }
        return;
      }
    }
    if (word === 'LNOBJ') {
      doc.lnobj.add(id(arg.slice(0, 2)));
      return;
    }
    if (word === 'LNTYPE') {
      doc.lntype = num() || 1;
      return;
    }
    doc.headers.set(word, arg);
  });
  return doc;
}

/** Two data lines of one channel as one: the finer grid, a later object winning its slot. */
function mergeSlots(a: string[], b: string[]): string[] {
  if (!a.length) return b;
  if (!b.length) return a;
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  const n = (a.length * b.length) / g(a.length, b.length);
  const out = new Array<string>(n).fill('00');
  a.forEach((s, i) => {
    if (s !== '00') out[(i * n) / a.length] = s;
  });
  b.forEach((s, i) => {
    if (s !== '00') out[(i * n) / b.length] = s;
  });
  return out;
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * A number's two-digit id, the inverse of bmsIdNumber: base 36 in upper case
 * (01 ... ZZ = 1295), base 62 with lower case after upper (... zz = 3843).
 */
export function bmsId(n: number, base: 36 | 62 = 36): string {
  if (!Number.isInteger(n) || n < 0 || n >= base * base)
    throw new RangeError(`${n} is not a two-digit base-${base} id`);
  return DIGITS[Math.floor(n / base)]! + DIGITS[n % base]!;
}

/** A base-36 (or 62) id's number: 00 -> 0, 0Z -> 35, 10 -> 36. */
export function bmsIdNumber(id: string, base: 36 | 62 = 36): number {
  const digit = (c: string) => {
    const code = c.charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 65 && code <= 90) return code - 55;
    if (code >= 97 && code <= 122) return base === 62 ? code - 61 : code - 87;
    return 0;
  };
  return digit(id[0] ?? '0') * base + digit(id[1] ?? '0');
}
