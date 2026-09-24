import { synthGame, SYNTH_EZ_TABLES } from '@ez2bms/chart-core';
import { tauriBackend } from './tauri';
import type { Backend } from './types';
import { demoFiles } from './demo';
import { DEMO_GAME, demoSkinFiles } from './demo-skin';
import { webBackend } from './web';

export * from './types';

/** The browser build's pretend controllers, for tests (bridge/web-pad.ts). */
function exposePad(b: Backend): Backend {
  if (b.devPad) (window as unknown as { __ez2bmsPad: unknown }).__ez2bmsPad = b.devPad;
  return b;
}

/** The desktop backend inside Tauri, the in-memory one anywhere else. */
export function createBackend(): Backend {
  if ('__TAURI_INTERNALS__' in window) return tauriBackend();
  const q = new URLSearchParams(location.search);
  const files = demoFiles(q.has('modes'), q.has('bench'));
  if (!q.has('skin') && !q.has('game')) return exposePad(webBackend(files));
  const defaults: Record<string, unknown> = { gameRoot: DEMO_GAME };
  // ?skin: a made-up game folder, so the game-skin path runs without a game.
  if (q.has('skin')) for (const [k, b] of demoSkinFiles()) files.set(k, b);
  // ?game: made-up songs in it (chart-core dev/synthgame.ts), to import and
  // export again - its made-up executable carries no chart tables, so the
  // made-up ones come with it.
  if (q.has('game')) {
    const g = synthGame();
    for (const [k, b] of g.files) files.set(`${DEMO_GAME}/${k}`, b);
    files.set(`${DEMO_GAME}/ez2ac_unpacked.exe`, g.exe);
    defaults.exe = `${DEMO_GAME}/ez2ac_unpacked.exe`;
    return exposePad(webBackend(files, defaults, { gameTables: SYNTH_EZ_TABLES }));
  }
  return exposePad(webBackend(files, defaults));
}
