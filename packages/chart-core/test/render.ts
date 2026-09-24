// Finds and runs crates/ez2bms-audio/examples/render_specs - the real mixer
// rendering engine events offline - so tests can check chart-core's model of
// the sound against what the engine plays. Build it with
// `cargo build -p ez2bms-audio --example render_specs`; suites that need it
// are skipped (not failed) when it is absent, and CI always builds it.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineEvent } from '../src/publish/playback';

const root = resolve(import.meta.dirname, '../../..');
const exe = process.platform === 'win32' ? 'render_specs.exe' : 'render_specs';

export const RENDER: string | undefined = [
  process.env.EZ2BMS_RENDER,
  resolve(root, 'target/release/examples', exe),
  resolve(root, 'target/debug/examples', exe),
].find((p): p is string => !!p && existsSync(p));

export interface RenderCase {
  rate: number;
  samples: { frames: number; channels: 1 | 2; seed: number }[];
  a: EngineEvent[];
  b: EngineEvent[];
}

export interface RenderReport {
  frames_a: number;
  frames_b: number;
  peak: number;
  max_diff: number;
}

export function renderPairs(cases: RenderCase[]): RenderReport[] {
  if (!RENDER) throw new Error('render_specs is not built');
  const out = execFileSync(RENDER, [], {
    input: JSON.stringify({ cases }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as RenderReport[];
}
