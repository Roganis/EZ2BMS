// Finds and runs crates/ez2port-oracle - EZ2PORT's own ez2core answering as
// JSON - so parity tests can compare the TypeScript implementations against
// the engine's code. Build it with `cargo build -p ez2port-oracle`; suites that
// need it are skipped (not failed) when it is absent, and CI always builds it.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const exe = process.platform === 'win32' ? 'ez2port-oracle.exe' : 'ez2port-oracle';

export const ORACLE: string | undefined = [
  process.env.EZ2PORT_ORACLE,
  resolve(root, 'target/release', exe),
  resolve(root, 'target/debug', exe),
].find((p): p is string => !!p && existsSync(p));

export function oracle<T = unknown>(args: string[], input?: string): T {
  if (!ORACLE) throw new Error('ez2port-oracle is not built');
  const out = execFileSync(ORACLE, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out) as T;
}
