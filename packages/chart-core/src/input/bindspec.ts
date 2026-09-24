// One controller binding, as text: a keyboard key, a pad button, a hat
// direction, an axis, the mouse or the virtual turntable. A transcription of
// EZ2PORT's ez2/bindspec.c (third_party/ez2port-core), proven against it by
// the oracle's `bindspec` command (test/input.oracle.test.ts): the grammar is
// the port's, so a binding copied between EZ2PORT's keys.ini and EZ2BMS means
// the same control in both.
//
//     S                       a key, by SDL's name for it
//     0810:e501/b3            button 3 of that device (`#n`: the n-th board)
//     0810:e501/h0.up         hat 0 held up (8 directions)
//     0810:e501/a2[:rev][,vel]  an axis - a turntable, not a button
//     mouse/x[:8]             a mouse axis        } turntables too
//     vtt[:4]                 the virtual one     }
//
// Byte for byte as the C: a token is cut at 127 bytes and a key name at 31
// (the port's buffers), and a token that clearly means a device but is
// malformed (`0810:e501/b`) is refused, so a typo is reported rather than
// bound to a key nobody has. Strings here are "byte strings" - one char per
// byte - so the cuts land where the C's do; toBytes/fromBytes convert.

export type BindKind = 'none' | 'key' | 'button' | 'hat' | 'axis' | 'mouse' | 'vtt';

/** The C enum's values (EZ2_BIND_*), for comparing with the oracle. */
export const BIND_KIND_CODE: Record<BindKind, number> = {
  none: 0,
  key: 1,
  button: 2,
  hat: 3,
  axis: 4,
  mouse: 5,
  vtt: 6,
};

/** Hat directions in 2EZConfig's order (HS_UP first, clockwise). */
export const HAT_NAMES = [
  'up',
  'upright',
  'right',
  'downright',
  'down',
  'downleft',
  'left',
  'upleft',
] as const;

export interface Bindspec {
  kind: BindKind;
  /** `vid:pid[#n]`, lower or upper case as written; '' for key, mouse and vtt. */
  device: string;
  /** Key only: SDL's scancode name. */
  key: string;
  /** Button, hat or axis number; mouse 0 = x, 1 = y; -1 otherwise. */
  index: number;
  /** Hat only: an index into HAT_NAMES; -1 otherwise. */
  dir: number;
  /** Axis only. */
  reverse: boolean;
  /** Axis only: it reports spin speed about centre, not a wrapping position. */
  velocity: boolean;
  /** Mouse sensitivity (1-20, default 5) or the virtual turntable's step (1-20, default 3). */
  amount: number;
}

const BIND_DEV = 32;
const BIND_KEYN = 32;
const TOKEN = 128;

/** Bytes as a byte string (one char per byte), in chunks the call stack takes. */
export function binaryOf(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

/** UTF-8 text as a byte string (one char per byte), as the C sees it. */
export function toBytes(text: string): string {
  return binaryOf(new TextEncoder().encode(text));
}

/** A byte string back to text. */
export function fromBytes(bytes: string): string {
  return new TextDecoder().decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0)));
}

/** ASCII-only case folding, as the C's hand-written compares. */
const lower = (c: string) => (c >= 'A' && c <= 'Z' ? String.fromCharCode(c.charCodeAt(0) + 32) : c);
export function asciiIeq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (lower(a[i]!) !== lower(b[i]!)) return false;
  return true;
}

export function hatFromName(name: string): number {
  return HAT_NAMES.findIndex((h) => asciiIeq(h, name));
}

/**
 * `strtol(s, &end, 10)` accepting only a whole number from 0 to 0xffff with
 * nothing after it. strtol's own leniency is kept - leading whitespace and a
 * sign - because the port's parser has it (`b+3` is button 3).
 */
function whole(s: string): number {
  if (!s) return -1;
  let i = 0;
  while (i < s.length && ' \t\n\v\f\r'.includes(s[i]!)) i++;
  let neg = false;
  if (s[i] === '+' || s[i] === '-') {
    neg = s[i] === '-';
    i++;
  }
  const start = i;
  while (i < s.length && s[i]! >= '0' && s[i]! <= '9') i++;
  if (i === start || i !== s.length) return -1;
  const v = Number(s.slice(start, i)) * (neg ? -1 : 1);
  if (v < 0 || v > 0xffff) return -1;
  return v === 0 ? 0 : v;
}

const isHex = (c: string | undefined) => !!c && /^[0-9a-fA-F]$/.test(c);

/** `vid:pid` or `vid:pid#n`, exactly. */
export function deviceKeyOk(s: string): boolean {
  for (let i = 0; i < 4; i++) if (!isHex(s[i])) return false;
  if (s[4] !== ':') return false;
  for (let i = 5; i < 9; i++) if (!isHex(s[i])) return false;
  if (s.length === 9) return true;
  if (s[9] !== '#') return false;
  const n = s.slice(10);
  return n.length > 0 && /^[0-9]+$/.test(n);
}

const none = (): Bindspec => ({
  kind: 'none',
  device: '',
  key: '',
  index: -1,
  dir: -1,
  reverse: false,
  velocity: false,
  amount: 0,
});

/** C's snprintf into a buffer of `size`: at most size - 1 bytes. */
const cut = (s: string, size: number) => s.slice(0, size - 1);

function parseInner(text: string, out: Bindspec): boolean {
  if (!text) return false;
  let t = text;
  while (t[0] === ' ' || t[0] === '\t') t = t.slice(1);
  let buf = cut(t, TOKEN);
  while (buf.endsWith(' ') || buf.endsWith('\t')) buf = buf.slice(0, -1);
  if (!buf) return false;

  // The virtual turntable: no device, no slash.
  if (buf.startsWith('vtt') && (buf.length === 3 || buf[3] === ':')) {
    out.kind = 'vtt';
    out.amount = 3;
    if (buf[3] === ':') {
      const v = whole(buf.slice(4));
      if (v < 1 || v > 20) return false;
      out.amount = v;
    }
    return true;
  }

  // A device spec only when the part before the slash is one: `/` itself is
  // a key (SDL's slash, P2's sixth key by default).
  const slash = buf.indexOf('/');
  const head = slash < 0 ? '' : buf.slice(0, slash);
  if (
    slash < 0 ||
    !(
      asciiIeq(head, 'mouse') ||
      (head.length > 0 && head.length + 1 <= BIND_DEV && deviceKeyOk(head))
    )
  ) {
    out.kind = 'key';
    out.key = cut(buf, BIND_KEYN);
    return true;
  }
  let tail = buf.slice(slash + 1);
  if (!tail) return false;
  // An option is `:something` after the control.
  let opt: string | undefined;
  const colon = tail.indexOf(':');
  if (colon >= 0) {
    opt = tail.slice(colon + 1);
    tail = tail.slice(0, colon);
  }

  if (asciiIeq(head, 'mouse')) {
    if (asciiIeq(tail, 'x')) out.index = 0;
    else if (asciiIeq(tail, 'y')) out.index = 1;
    else return false;
    out.kind = 'mouse';
    out.amount = 5;
    if (opt !== undefined) {
      const v = whole(opt);
      if (v < 1 || v > 20) return false;
      out.amount = v;
    }
    return true;
  }

  if (!deviceKeyOk(head)) return false;
  out.device = cut(head, BIND_DEV);

  const c = tail[0];
  if (c === 'b' || c === 'B') {
    const v = whole(tail.slice(1));
    if (v < 0 || opt !== undefined) return false;
    out.kind = 'button';
    out.index = v;
    return true;
  }
  if (c === 'a' || c === 'A') {
    const v = whole(tail.slice(1));
    if (v < 0) return false;
    out.kind = 'axis';
    out.index = v;
    out.reverse = false;
    out.velocity = false;
    if (opt !== undefined) {
      if (opt.length >= 32) return false;
      // Walked as the C walks it: an empty item ends the list.
      let q: string | undefined = opt;
      while (q) {
        const k = q.indexOf(',');
        const item = k < 0 ? q : q.slice(0, k);
        if (asciiIeq(item, 'rev')) out.reverse = true;
        else if (asciiIeq(item, 'vel')) out.velocity = true;
        else return false;
        q = k < 0 ? undefined : q.slice(k + 1);
      }
    }
    return true;
  }
  if (c === 'h' || c === 'H') {
    const dot = tail.indexOf('.');
    if (dot < 0 || opt !== undefined) return false;
    const v = whole(tail.slice(1, dot));
    const d = hatFromName(tail.slice(dot + 1));
    if (v < 0 || d < 0) return false;
    out.kind = 'hat';
    out.index = v;
    out.dir = d;
    return true;
  }
  return false;
}

/**
 * One token (a byte string), or null when it clearly means a device and is
 * malformed. Anything that is not one of the other forms is a key name.
 */
export function parseBindspec(text: string): Bindspec | null {
  const out = none();
  return parseInner(text, out) ? out : null;
}

export function formatBindspec(b: Bindspec): string {
  switch (b.kind) {
    case 'key':
      return cut(b.key, TOKEN);
    case 'button':
      return `${b.device}/b${b.index}`;
    case 'hat':
      return `${b.device}/h${b.index}.${HAT_NAMES[b.dir] ?? 'up'}`;
    case 'axis':
      return `${b.device}/a${b.index}${b.reverse && b.velocity ? ':rev,vel' : b.velocity ? ':vel' : b.reverse ? ':rev' : ''}`;
    case 'mouse': {
      const axis = b.index === 1 ? 'y' : 'x';
      return b.amount !== 5 ? `mouse/${axis}:${b.amount}` : `mouse/${axis}`;
    }
    case 'vtt':
      return b.amount !== 3 ? `vtt:${b.amount}` : 'vtt';
    default:
      return '';
  }
}

/** A turntable binding (axis, mouse, virtual), as opposed to one that raises a channel. */
export function isAnalogBinding(b: Bindspec): boolean {
  return b.kind === 'axis' || b.kind === 'mouse' || b.kind === 'vtt';
}
