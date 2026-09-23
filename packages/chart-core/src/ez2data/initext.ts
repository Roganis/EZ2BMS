// Small text helpers shared by the EZ2 data parsers. They mirror the C
// library calls EZ2PORT's parsers use (strtol, atoi, isspace), so a value the
// port reads one way is read the same way here.

/** C `strtol(s, 0, 10)`: leading whitespace, optional sign, digits; 0 if none. */
export function strtol(s: string): number {
  const m = /^[\t\n\v\f\r ]*([+-]?\d+)/.exec(s);
  return m ? Number.parseInt(m[1]!, 10) : 0;
}

/** C `atoi` (same as strtol for our purposes). */
export const atoi = strtol;

/** Trim C-`isspace` characters from both ends. */
export function ctrim(s: string): string {
  return s.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '');
}

/** Case-insensitive ASCII equality (C `ci_eq`). */
export function ciEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Decode an EZ2 text file. The game's text files are CP949 (Korean Windows);
 * TextDecoder's "euc-kr" is the WHATWG windows-949 decoder, a superset. ASCII
 * decodes identically either way.
 */
export function decodeCp949(bytes: Uint8Array): string {
  return new TextDecoder('euc-kr').decode(bytes);
}

const I64_MAX = (1n << 63n) - 1n;
const I64_MIN = -(1n << 63n);

/**
 * `(int)strtol(s, 0, 10)` as EZ2PORT's parsers write it, on the LP64 builds
 * the oracle runs: the value clamps to a 64-bit long, then the cast keeps its
 * low 32 bits. (Only a file with an absurd number tells the two apart from a
 * plain parse; the Windows build's 32-bit long clamps sooner.)
 */
export function strtolInt(s: string): number {
  const m = /^[\t\n\v\f\r ]*([+-]?)(\d+)/.exec(s);
  if (!m) return 0;
  let v = BigInt(m[2]!);
  if (m[1] === '-') v = -v;
  if (v > I64_MAX) v = I64_MAX;
  if (v < I64_MIN) v = I64_MIN;
  return Number(BigInt.asIntN(32, v));
}

/**
 * C `atof` (strtod): leading C-space, then the longest number it can read -
 * a decimal with optional fraction and exponent, a hexadecimal float
 * (`0x1.8p3`), `inf`/`infinity` or `nan` - or 0.
 */
export function atof(s: string): number {
  const t = s.replace(/^[\t\n\v\f\r ]+/, '');
  const sign = t[0] === '-' ? -1 : 1;
  const u = t[0] === '-' || t[0] === '+' ? t.slice(1) : t;
  if (/^inf/i.test(u)) return sign * Infinity;
  if (/^nan/i.test(u)) return NaN;
  const hex = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?/.exec(u);
  if (hex && (hex[1] || hex[2])) {
    const int = hex[1] ?? '';
    const frac = hex[2] ?? '';
    let v = 0;
    for (const c of int + frac) v = v * 16 + Number.parseInt(c, 16);
    v /= 16 ** frac.length;
    const exp = /^[pP]([+-]?\d+)/.exec(u.slice(hex[0].length));
    if (exp) v *= 2 ** Number(exp[1]);
    return sign * v;
  }
  const dec = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(u);
  if (!dec) return 0;
  return sign * Number(dec[0]);
}
