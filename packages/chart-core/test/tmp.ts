// Scratch files for tests that hand bytes to the oracle.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function withTmpDir<T>(
  fn: (dir: string, write: (name: string, data: Uint8Array | string) => string) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), 'ez2bms-'));
  try {
    return fn(dir, (name, data) => {
      const p = join(dir, name);
      writeFileSync(p, data);
      return p;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
