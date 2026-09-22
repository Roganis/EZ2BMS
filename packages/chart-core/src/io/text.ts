// Text rules shared by every reader and writer.
//
// EZ2PORT's parsers do not strip a UTF-8 byte-order mark (ez2/util.h), so a
// BOM in an .ezi turns its first line's note number into garbage; EZ2BMS
// therefore never writes one, and strips one when reading. bmson strings must
// be valid UTF-8 (a lone Shift-JIS byte is not) - EZ2PORT's title plate and
// song.ini are UTF-8.

const BOM = [0xef, 0xbb, 0xbf];

export interface DecodedText {
  text: string;
  hadBom: boolean;
}

export class TextEncodingError extends Error {}

/** Decode strict UTF-8 (throws TextEncodingError on invalid bytes), stripping a BOM. */
export function decodeUtf8(bytes: Uint8Array): DecodedText {
  const hadBom = bytes.length >= 3 && BOM.every((b, i) => bytes[i] === b);
  const body = hadBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), hadBom };
  } catch {
    throw new TextEncodingError('not valid UTF-8');
  }
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Byte length of a string once encoded as UTF-8. */
export function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** True when the string has an unpaired surrogate (cannot be encoded as UTF-8). */
export function hasLoneSurrogate(text: string): boolean {
  return /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
}
