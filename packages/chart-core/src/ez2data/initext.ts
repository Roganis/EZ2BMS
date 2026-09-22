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
