// A BMS file's text encoding.
//
// BMS has none declared. Files are UTF-8 (recent tools), Shift-JIS (most of
// the Japanese scene) or EUC-KR / CP949 (the Korean scene - and so most EZ2
// conversions; BMSE on a Korean Windows wrote it). Reading one as another
// gives mojibake titles and sound names that match no file, so the choice is
// made carefully and shown, with an override:
//
// 1. A byte-order mark says so.
// 2. Valid UTF-8 (which includes plain ASCII) is UTF-8: other encodings'
//    high bytes almost never form valid UTF-8 sequences.
// 3. Otherwise Shift-JIS and CP949 are both tried. Browsers decode "euc-kr"
//    as CP949 (WHATWG), which accepts most Shift-JIS byte pairs too, so the
//    replacement-character count alone cannot tell them apart; the pairs
//    themselves can. Korean text is almost all KS X 1001 syllables - both
//    bytes 0xA1-0xFE - while Japanese text leans on leads 0x81-0x9F (kana,
//    common kanji), which KS X 1001 never uses. Fewer decoding errors wins;
//    on a tie the share of KS X 1001 pairs decides.
//
// (beatoraja's jbms-parser tries EUC-KR, then MS932, by a round trip through
// Java's encoders; the WHATWG decoders offer no encoder to round-trip with.)

export type BmsEncoding = 'utf-8' | 'shift_jis' | 'euc-kr' | 'utf-16le' | 'utf-16be';

export interface DecodedBms {
  text: string;
  encoding: BmsEncoding;
  /** Whether the bytes left little doubt (a BOM, UTF-8, or a clear winner). */
  sure: boolean;
}

/** Decode with an encoding (non-fatal: bad bytes become U+FFFD). */
export function decodeAs(bytes: Uint8Array, encoding: BmsEncoding): string {
  const text = new TextDecoder(encoding).decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const replacements = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xfffd) n++;
  return n;
};

/** Share of CP949 double-byte pairs that are KS X 1001 (both bytes 0xA1-0xFE); undefined with none. */
function ksShare(b: Uint8Array): number | undefined {
  let pairs = 0;
  let ks = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    if (c < 0x81 || c === 0xff) continue;
    const d = b[i + 1];
    if (d === undefined) break;
    pairs++;
    if (c >= 0xa1 && c <= 0xfe && d >= 0xa1 && d <= 0xfe) ks++;
    i++;
  }
  return pairs ? ks / pairs : undefined;
}

export function decodeBms(bytes: Uint8Array): DecodedBms {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: decodeAs(bytes, 'utf-8'), encoding: 'utf-8', sure: true };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: decodeAs(bytes, 'utf-16le'), encoding: 'utf-16le', sure: true };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: decodeAs(bytes, 'utf-16be'), encoding: 'utf-16be', sure: true };
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
      sure: true,
    };
  } catch {
    // not UTF-8
  }
  const jp = decodeAs(bytes, 'shift_jis');
  const kr = decodeAs(bytes, 'euc-kr');
  const ej = replacements(jp);
  const ek = replacements(kr);
  if (ej !== ek) {
    const encoding = ej < ek ? 'shift_jis' : 'euc-kr';
    return { text: encoding === 'shift_jis' ? jp : kr, encoding, sure: Math.min(ej, ek) === 0 };
  }
  const share = ksShare(bytes) ?? 0;
  const korean = share >= 0.8;
  return {
    text: korean ? kr : jp,
    encoding: korean ? 'euc-kr' : 'shift_jis',
    sure: share >= 0.95 || share <= 0.3,
  };
}
