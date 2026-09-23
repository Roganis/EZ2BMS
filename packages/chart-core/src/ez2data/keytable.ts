// Reading the cipher key tables out of the user's OWN unpacked EZ2AC
// executable, as EZ2PORT does (ez2/keytable.c): map each table's virtual
// address to a file offset through the PE section table, take every 4th byte
// of a 2048-byte region, and check the result against a one-way FNV-1a
// digest. Only addresses and digests live here; "a one-way digest of the table
// is not the table, so committing it distributes nothing" (keytable.h).

import { KEYTABLE_SIZE } from './crypt';
import { fnv1a64Hex } from './abm';

export type KeyKind = 'ez' | 'ezi' | 'ini';

const TABLE_VA: Record<KeyKind, number> = { ez: 0x004a74b0, ezi: 0x004a7cb0, ini: 0x004a8568 };
const TABLE_HASH: Record<KeyKind, string> = {
  ez: '1c6c5de0f271f9f6',
  ezi: 'fe3022e6e9e0f9a8',
  ini: 'b098013e0d4e4923',
};
const REGION = 2048;

export class KeyTableError extends Error {
  constructor(
    message: string,
    readonly code: 'format' | 'address' | 'verify',
  ) {
    super(message);
  }
}

/** File offset of a virtual address in a PE32 image, with `need` bytes backed by file data. */
export function peVaToOffset(exe: Uint8Array, va: number, need: number): number {
  const hdr = exe.subarray(0, 4096);
  const dv = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
  const fail = (m: string) => new KeyTableError(m, 'format');
  if (hdr.length < 0x40 || hdr[0] !== 0x4d || hdr[1] !== 0x5a)
    throw fail('not an executable (no MZ)');
  const pe = dv.getUint32(0x3c, true);
  if (pe + 24 + 96 > hdr.length) throw fail('PE header out of range');
  if (hdr[pe] !== 0x50 || hdr[pe + 1] !== 0x45 || hdr[pe + 2] !== 0 || hdr[pe + 3] !== 0) {
    throw fail('not a PE image');
  }
  if (dv.getUint16(pe + 24, true) !== 0x10b) throw fail('not a 32-bit PE image');
  const nsec = dv.getUint16(pe + 6, true);
  const optsize = dv.getUint16(pe + 20, true);
  const base = dv.getUint32(pe + 24 + 28, true);
  const secoff = pe + 24 + optsize;
  const addr = new KeyTableError(
    'key table address is not in any section (is this the PACKED executable?)',
    'address',
  );
  if (va < base) throw addr;
  const rva = va - base;
  if (secoff + nsec * 40 > hdr.length) throw fail('section table out of range');
  for (let i = 0; i < nsec; i++) {
    const s = secoff + i * 40;
    const vaddr = dv.getUint32(s + 12, true);
    const rsize = dv.getUint32(s + 16, true);
    const raddr = dv.getUint32(s + 20, true);
    if (rva >= vaddr && rva - vaddr < rsize) {
      const d = rva - vaddr;
      if (rsize - d < need) throw addr;
      return raddr + d;
    }
  }
  throw addr;
}

/** Extract and verify one key table from the bytes of the user's executable. */
export function keyTableFromExe(exe: Uint8Array, kind: KeyKind): Uint8Array {
  const off = peVaToOffset(exe, TABLE_VA[kind], REGION);
  if (off + REGION > exe.length) throw new KeyTableError('executable is truncated', 'address');
  const t = new Uint8Array(KEYTABLE_SIZE);
  for (let i = 0; i < KEYTABLE_SIZE; i++) t[i] = exe[off + i * 4]!;
  if (!verifyKeyTable(t, kind)) {
    throw new KeyTableError(
      'extracted data is not the expected key table (wrong or modified executable)',
      'verify',
    );
  }
  return t;
}

export function verifyKeyTable(t: Uint8Array, kind: KeyKind): boolean {
  return t.length === KEYTABLE_SIZE && fnv1a64Hex(t) === TABLE_HASH[kind];
}

export const KEY_TABLE_VA = TABLE_VA;

/**
 * `n` bytes of the executable at a virtual address, as ez2_exe_read gives
 * them: for data the port reads straight out of the image (song.bin's
 * cipher tables), which has no digest to check - the caller checks what it
 * decrypts instead.
 */
export function exeRead(exe: Uint8Array, va: number, n: number): Uint8Array {
  const off = peVaToOffset(exe, va, n);
  if (off + n > exe.length) throw new KeyTableError('executable is truncated', 'address');
  return exe.slice(off, off + n);
}
