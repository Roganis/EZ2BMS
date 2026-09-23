// Writing text in the two legacy encodings EZ2 material lives in: CP949
// (Korean Windows - the game's own chart names, and most EZ2 BMS conversions)
// and Shift-JIS (what LR2 reads, and most BMS in the wild).
//
// Browsers and Node can decode both (WHATWG "euc-kr" is windows-949, and
// "shift_jis" is windows-31J) but TextEncoder writes only UTF-8. Rather than
// commit a code table, the encoder is the platform's own decoder turned
// around: every two-byte sequence is decoded once, in the order WHATWG's
// encoders search their index, and the first sequence that gives a character
// is the one written for it. So what we write is exactly what WHATWG's
// encoder would write, and decoding it gives the same text back.
//
// WHATWG's rules that decoding alone does not show (Encoding Standard,
// "Shift_JIS encoder" and "EUC-KR encoder"):
// - Shift-JIS: pointers 8272-8835 (NEC's copies of the IBM extensions, lead
//   bytes 0xED/0xEE) are never written, so the IBM forms (0xFA-0xFC) win;
//   U+00A5 is written 0x5C and U+203E 0x7E (JIS-Roman); U+2212 is written as
//   U+FF0D; private-use characters (the user-defined area) are not written.
// - Both: the first pointer for a character wins.
//
// CP949 is not taken whole from the decoder, because Node's is not WHATWG's:
// its ICU "euc-kr" is plain EUC-KR (KS X 1001 only, plus the user-defined
// rows), where browsers - and the Windows the game ran on - read windows-949.
// The two agree on every KS X 1001 pair (checked against Chromium: 8224 of
// 8224), so that region comes from the decoder, and the rest is what CP949
// adds, which needs no table:
// - the 8822 Hangul syllables KS X 1001 lacks, in Unicode order, laid over
//   lead bytes 0x81-0xC6 with trails 0x41-0x5A, 0x61-0x7A and 0x81-0xFE
//   (0x81-0xA0 from lead 0xA1 on, where KS X 1001 takes the rest) - Unified
//   Hangul Code's own definition, which ends at 0xC652 (checked: all 8822
//   equal Chromium's decoder);
// - the euro and registered signs KS X 1001:1998 put at 0xA2E6/0xA2E7.
// So tests under Node write exactly what the editor writes in its webview.

export type LegacyEncoding = 'euc-kr' | 'shift_jis';

export interface LegacyText {
  bytes: Uint8Array;
  /** Characters the encoding has no bytes for (each written as '?'), once each, in order. */
  unmappable: string[];
}

const tables = new Map<LegacyEncoding, Map<number, number>>();

/** Code point -> the two-byte sequence (lead << 8 | trail) written for it. */
function table(enc: LegacyEncoding): Map<number, number> {
  let t = tables.get(enc);
  if (t) return t;
  const pairs: number[] = [];
  if (enc === 'euc-kr') {
    // KS X 1001's region only; what CP949 adds is filled in below.
    for (let lead = 0xa1; lead <= 0xfe; lead++)
      for (let trail = 0xa1; trail <= 0xfe; trail++) pairs.push((lead << 8) | trail);
  } else {
    const leads = [...range(0x81, 0x9f), ...range(0xe0, 0xfc)];
    const trails = [...range(0x40, 0x7e), ...range(0x80, 0xfc)];
    for (const lead of leads) {
      for (const trail of trails) {
        const pointer =
          (lead - (lead < 0xa0 ? 0x81 : 0xc1)) * 188 + trail - (trail < 0x7f ? 0x40 : 0x41);
        if (pointer >= 8272 && pointer <= 8835) continue;
        pairs.push((lead << 8) | trail);
      }
    }
  }
  // One decode for the lot: each pair, then a newline (no pair decodes to one,
  // and a pair the decoder rejects gives U+FFFD, plus its trail if ASCII).
  const buf = new Uint8Array(pairs.length * 3);
  pairs.forEach((p, i) => {
    buf[i * 3] = p >> 8;
    buf[i * 3 + 1] = p & 0xff;
    buf[i * 3 + 2] = 0x0a;
  });
  const parts = new TextDecoder(enc).decode(buf).split('\n');
  t = new Map();
  for (let i = 0; i < pairs.length; i++) {
    const s = parts[i]!;
    const cp = s.codePointAt(0);
    if (cp === undefined || cp === 0xfffd || s.length !== (cp > 0xffff ? 2 : 1)) continue;
    if (cp >= 0xe000 && cp <= 0xf8ff) continue; // user-defined area: never written
    if (!t.has(cp)) t.set(cp, pairs[i]!);
  }
  if (enc === 'euc-kr') {
    t.set(0x20ac, 0xa2e6);
    t.set(0x00ae, 0xa2e7);
    let i = 0;
    const codes = uhcCodes();
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) if (!t.has(cp)) t.set(cp, codes[i++]!);
  }
  tables.set(enc, t);
  return t;
}

/** Unified Hangul Code's extension positions, in order (0x8141 ... 0xC652). */
function uhcCodes(): number[] {
  const out: number[] = [];
  for (let lead = 0x81; lead <= 0xc6; lead++) {
    for (let t = 0x41; t <= 0x5a; t++) out.push((lead << 8) | t);
    for (let t = 0x61; t <= 0x7a; t++) out.push((lead << 8) | t);
    for (let t = 0x81; t <= (lead < 0xa1 ? 0xfe : 0xa0); t++) out.push((lead << 8) | t);
  }
  return out;
}

function* range(a: number, b: number): Generator<number> {
  for (let i = a; i <= b; i++) yield i;
}

/** The bytes for one character, or undefined if the encoding has none. */
function encodeChar(cp: number, enc: LegacyEncoding): number[] | undefined {
  if (cp < 0x80) return [cp];
  if (enc === 'shift_jis') {
    if (cp === 0x80) return [0x80];
    if (cp === 0xa5) return [0x5c];
    if (cp === 0x203e) return [0x7e];
    if (cp >= 0xff61 && cp <= 0xff9f) return [cp - 0xff61 + 0xa1];
    if (cp === 0x2212) cp = 0xff0d;
  }
  const p = table(enc).get(cp);
  return p === undefined ? undefined : [p >> 8, p & 0xff];
}

/** Encode text; characters the encoding lacks become '?' and are listed. */
export function encodeLegacy(text: string, enc: LegacyEncoding): LegacyText {
  const out: number[] = [];
  const unmappable: string[] = [];
  for (const ch of text) {
    const b = encodeChar(ch.codePointAt(0)!, enc);
    if (b) out.push(...b);
    else {
      out.push(0x3f);
      if (!unmappable.includes(ch)) unmappable.push(ch);
    }
  }
  return { bytes: new Uint8Array(out), unmappable };
}

/** Whether every character of the text has bytes in the encoding. */
export function fitsLegacy(text: string, enc: LegacyEncoding): boolean {
  for (const ch of text) if (!encodeChar(ch.codePointAt(0)!, enc)) return false;
  return true;
}

/**
 * An EZFF name field in CP949, as the game's own charts have them: at most
 * `max` bytes (63, leaving the NUL of the 64-byte field), cut at a character
 * boundary so the last character is never half a pair.
 */
export function cp949Field(text: string, max = 63): LegacyText {
  const out: number[] = [];
  const unmappable: string[] = [];
  for (const ch of text) {
    let b = encodeChar(ch.codePointAt(0)!, 'euc-kr');
    if (!b) {
      if (!unmappable.includes(ch)) unmappable.push(ch);
      b = [0x3f];
    }
    if (out.length + b.length > max) break;
    out.push(...b);
  }
  return { bytes: new Uint8Array(out), unmappable };
}
