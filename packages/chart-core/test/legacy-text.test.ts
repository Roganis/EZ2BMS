import { describe, expect, it } from 'vitest';
import { cp949Field, encodeLegacy, fitsLegacy, type LegacyEncoding } from '../src/io/legacy-text';

// Every two-byte sequence the platform decodes to one character (not U+FFFD).
function decodable(enc: LegacyEncoding): { bytes: [number, number]; ch: string }[] {
  const leads = enc === 'euc-kr' ? span(0x81, 0xfe) : [...span(0x81, 0x9f), ...span(0xe0, 0xfc)];
  const trails = enc === 'euc-kr' ? span(0x41, 0xfe) : [...span(0x40, 0x7e), ...span(0x80, 0xfc)];
  const dec = new TextDecoder(enc);
  const out: { bytes: [number, number]; ch: string }[] = [];
  for (const l of leads)
    for (const t of trails) {
      const ch = dec.decode(new Uint8Array([l, t]));
      const cp = ch.codePointAt(0)!;
      if (cp !== 0xfffd && [...ch].length === 1) out.push({ bytes: [l, t], ch });
    }
  return out;
}

function span(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

describe('legacy encoders (the platform decoder, inverted)', () => {
  it('CP949: every KS X 1001 pair encodes back to itself, and no character has two', () => {
    const all = decodable('euc-kr').filter(
      ({ bytes: [l, t], ch }) =>
        l >= 0xa1 && t >= 0xa1 && !(ch.codePointAt(0)! >= 0xe000 && ch.codePointAt(0)! <= 0xf8ff),
    );
    expect(all.length).toBeGreaterThanOrEqual(8224);
    const seen = new Set<string>();
    for (const { bytes, ch } of all) {
      expect(seen.has(ch), `${ch} twice`).toBe(false);
      seen.add(ch);
      expect(hex(encodeLegacy(ch, 'euc-kr').bytes)).toBe(hex(new Uint8Array(bytes)));
    }
  });

  it("CP949: every Hangul syllable has its own code, UHC's extension in Unicode order", () => {
    const codes = new Set<string>();
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
      const w = encodeLegacy(String.fromCodePoint(cp), 'euc-kr');
      expect(w.unmappable).toEqual([]);
      expect(w.bytes.length).toBe(2);
      codes.add(hex(w.bytes));
    }
    expect(codes.size).toBe(11172);
    // The extension's first and last positions, and a KS X 1001 syllable.
    expect(hex(encodeLegacy('\uac02', 'euc-kr').bytes)).toBe('81 41'); // 갂
    expect(hex(encodeLegacy('\uac00', 'euc-kr').bytes)).toBe('b0 a1'); // 가
    const ext = [...codes].filter(
      (c) => Number.parseInt(c.slice(0, 2), 16) < 0xa1 || Number.parseInt(c.slice(3), 16) < 0xa1,
    );
    expect(ext.length).toBe(8822);
    expect(ext.sort().at(-1)).toBe('c6 52');
    expect(hex(encodeLegacy('\u20ac\u00ae', 'euc-kr').bytes)).toBe('a2 e6 a2 e7');
  });

  it('Shift-JIS: every character decodes back from what is written, duplicates to one form', () => {
    const dec = new TextDecoder('shift_jis');
    const forms = new Map<string, number[][]>();
    for (const { bytes, ch } of decodable('shift_jis')) {
      if (ch.codePointAt(0)! >= 0xe000 && ch.codePointAt(0)! <= 0xf8ff) continue; // user-defined
      forms.set(ch, [...(forms.get(ch) ?? []), bytes]);
      const w = encodeLegacy(ch, 'shift_jis');
      expect(w.unmappable, ch).toEqual([]);
      expect(dec.decode(w.bytes)).toBe(ch);
    }
    // Where a character has several forms, the one written is WHATWG's: never
    // NEC's copy of the IBM extensions (lead 0xED/0xEE), else the first.
    const ibm = '\u7e8a'; // 纊: 0xED40 (NEC-selected) and 0xFA5C (IBM)
    expect(forms.get(ibm)!.length).toBe(2);
    expect(hex(encodeLegacy(ibm, 'shift_jis').bytes)).toBe('fa 5c');
    const because = '\u2235'; // ∵: 0x81E6, 0x879A, 0xFA5B -> the first
    expect(hex(encodeLegacy(because, 'shift_jis').bytes)).toBe('81 e6');
  });

  it("Shift-JIS's single bytes and JIS-Roman", () => {
    expect(hex(encodeLegacy('A\u00a5\u203e\uff71\u0080', 'shift_jis').bytes)).toBe(
      '41 5c 7e b1 80',
    );
    expect(hex(encodeLegacy('\u2212', 'shift_jis').bytes)).toBe(
      hex(encodeLegacy('\uff0d', 'shift_jis').bytes),
    );
    expect(encodeLegacy('\ue000', 'shift_jis').unmappable).toEqual(['\ue000']);
  });

  it('ASCII is itself; what does not fit is "?" and listed once', () => {
    const ascii = String.fromCharCode(...span(0, 0x7f));
    for (const enc of ['euc-kr', 'shift_jis'] as const)
      expect([...encodeLegacy(ascii, enc).bytes]).toEqual(span(0, 0x7f));
    const k = encodeLegacy('한テ한😀', 'euc-kr');
    expect(new TextDecoder('euc-kr').decode(k.bytes)).toBe('한テ한?');
    expect(k.unmappable).toEqual(['😀']);
    const j = encodeLegacy('テスト曲 한국', 'shift_jis');
    expect(new TextDecoder('shift_jis').decode(j.bytes)).toBe('テスト曲 ??');
    expect(j.unmappable).toEqual(['한', '국']);
    expect(fitsLegacy('テスト曲', 'shift_jis')).toBe(true);
    expect(fitsLegacy('테스트', 'shift_jis')).toBe(false);
    expect(fitsLegacy('테스트 곡', 'euc-kr')).toBe(true);
  });

  it('cp949Field cuts at a character boundary within 63 bytes', () => {
    const f = cp949Field('가'.repeat(40)); // 80 bytes as CP949
    expect(f.bytes.length).toBe(62);
    expect(new TextDecoder('euc-kr').decode(f.bytes)).toBe('가'.repeat(31));
    expect(cp949Field('A' + '가'.repeat(40)).bytes.length).toBe(63);
    expect(cp949Field('x', 0).bytes.length).toBe(0);
    expect(cp949Field('dirty 😀').unmappable).toEqual(['😀']);
  });
});
