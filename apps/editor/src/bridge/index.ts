import { tauriBackend } from './tauri';
import type { Backend } from './types';
import { demoFiles } from './demo';
import { DEMO_GAME, demoSkinFiles } from './demo-skin';
import { webBackend } from './web';

export * from './types';

/** The desktop backend inside Tauri, the in-memory one anywhere else. */
export function createBackend(): Backend {
  if ('__TAURI_INTERNALS__' in window) return tauriBackend();
  const q = new URLSearchParams(location.search);
  const files = demoFiles(q.has('modes'), q.has('bench'));
  // ?skin: a made-up game folder, so the game-skin path runs without a game.
  if (!q.has('skin')) return webBackend(files);
  for (const [k, b] of demoSkinFiles()) files.set(k, b);
  return webBackend(files, { gameRoot: DEMO_GAME });
}
