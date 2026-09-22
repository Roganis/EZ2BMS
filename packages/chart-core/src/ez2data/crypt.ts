// The EZ2AC file cipher for .ez, .ezi and .ini (EZ2PORT ez2/crypt.c; the
// Bible's cipher.md). Not XOR: the file is processed in alternating 8/16-byte
// blocks, reversed, and each byte shifted by a 512-entry table byte chosen by a
// rolling index. Each file type has its own table, which EZ2BMS never ships:
// keytable.ts reads it out of the user's own executable.

export const KEYTABLE_SIZE = 512;

function blockLen(pos: number, n: number, flag: { v: number }): number {
  if (pos + 8 > n) return n - pos;
  const len = flag.v === 0 ? 8 : pos + 16 > n ? n - pos : 16;
  flag.v ^= 1;
  return len;
}

function check(table: Uint8Array): void {
  if (table.length !== KEYTABLE_SIZE)
    throw new Error(`a key table is 512 bytes, got ${table.length}`);
}

export function ez2Decrypt(input: Uint8Array, table: Uint8Array): Uint8Array {
  check(table);
  const n = input.length;
  const out = new Uint8Array(n);
  const flag = { v: 0 };
  let pos = 0;
  let roll = 0;
  while (pos < n) {
    const len = blockLen(pos, n, flag);
    const src = n - pos - len;
    for (let u = 0; u < len; u++) {
      out[pos + u] = (input[src + u]! - table[(roll + len - 1 - u) & 0x1ff]!) & 0xff;
    }
    roll = (roll + len) & 0x1ff;
    pos += len;
  }
  return out;
}

export function ez2Encrypt(input: Uint8Array, table: Uint8Array): Uint8Array {
  check(table);
  const n = input.length;
  const out = new Uint8Array(n);
  const flag = { v: 0 };
  let pos = 0;
  let roll = 0;
  while (pos < n) {
    const len = blockLen(pos, n, flag);
    const dst = n - pos - len;
    for (let u = 0; u < len; u++) {
      out[dst + u] = (input[pos + u]! + table[(roll + len - 1 - u) & 0x1ff]!) & 0xff;
    }
    roll = (roll + len) & 0x1ff;
    pos += len;
  }
  return out;
}

/**
 * Whether a file is already plaintext, as EZ2PORT decides (ez2/file.c): an
 * .ez that starts "EZFF", or an .ezi/.ini whose first 512 bytes hold no
 * control characters besides TAB/LF/CR (and no DEL).
 */
export function looksPlaintext(kind: 'ez' | 'ezi' | 'ini', data: Uint8Array): boolean {
  if (kind === 'ez')
    return (
      data.length >= 4 &&
      data[0] === 0x45 &&
      data[1] === 0x5a &&
      data[2] === 0x46 &&
      data[3] === 0x46
    );
  const n = Math.min(512, data.length);
  for (let i = 0; i < n; i++) {
    const c = data[i]!;
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) return false;
  }
  return true;
}
