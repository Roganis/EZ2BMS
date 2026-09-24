// EZ2PORT's settings.ini (ez2/portcfg.c ez2_portcfg_load), for the one value
// the editor takes from it: the input `Debounce`, the milliseconds after an
// edge in which another edge on the same channel is switch chatter
// (platform/common/ezinput.c). The rest of the file is the port's business.
//
// Read line by line as fgets reads it into a 256-byte buffer - so a line of
// 255 bytes or more is read in pieces, each a line of its own - then:
// `;` starts a comment anywhere, blanks/tabs/line ends are trimmed, a line
// starting `[` or `#` is skipped, `Key = value` split at the first `=`, the
// key matched ignoring ASCII case, the value read by atoi, and only 0..100
// taken. A later line wins. Checked against the port's reader
// (test/input.oracle.test.ts, oracle `portcfg`).

/** The port's default (ez2_portcfg_defaults). */
export const DEFAULT_DEBOUNCE_MS = 8;

const FGETS = 255;

function trim(b: Uint8Array): Uint8Array {
  const blank = (c: number) => c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a;
  let s = 0;
  let e = b.length;
  while (s < e && blank(b[s]!)) s++;
  while (e > s && blank(b[e - 1]!)) e--;
  return b.subarray(s, e);
}

/** C atoi on the value: leading white space, a sign, digits. */
function atoi(b: Uint8Array): number {
  let i = 0;
  while (i < b.length && (b[i] === 0x20 || (b[i]! >= 0x09 && b[i]! <= 0x0d))) i++;
  let neg = false;
  if (b[i] === 0x2b || b[i] === 0x2d) neg = b[i++] === 0x2d;
  let v = 0;
  while (i < b.length && b[i]! >= 0x30 && b[i]! <= 0x39 && v < 1e9) v = v * 10 + (b[i++]! - 0x30);
  return neg ? 0 - v : v;
}

const WANT = 'debounce';

function isDebounce(key: Uint8Array): boolean {
  if (key.length !== WANT.length) return false;
  for (let i = 0; i < key.length; i++) {
    let c = key[i]!;
    if (c >= 0x41 && c <= 0x5a) c += 32;
    if (c !== WANT.charCodeAt(i)) return false;
  }
  return true;
}

/** The Debounce a settings.ini sets (the last valid one), or undefined when it sets none. */
export function portDebounce(text: string | Uint8Array): number | undefined {
  const b = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let out: number | undefined;
  let i = 0;
  while (i < b.length) {
    let j = i;
    while (j < b.length && j - i < FGETS) if (b[j++] === 0x0a) break;
    let line = b.subarray(i, j);
    i = j;
    // A C string ends at its first NUL; the comment at its first `;`.
    for (const stop of [0x00, 0x3b]) {
      const k = line.indexOf(stop);
      if (k >= 0) line = line.subarray(0, k);
    }
    line = trim(line);
    if (!line.length || line[0] === 0x5b || line[0] === 0x23) continue;
    const eq = line.indexOf(0x3d);
    if (eq < 0) continue;
    if (!isDebounce(trim(line.subarray(0, eq)))) continue;
    const v = atoi(trim(line.subarray(eq + 1)));
    if (v >= 0 && v <= 100) out = v;
  }
  return out;
}
