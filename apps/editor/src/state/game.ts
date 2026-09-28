// The configured EZ2AC data folder, read the same way for importing a song
// from it (importer.svelte.ts) and exporting one back (exporter.svelte.ts):
// chart-core's openGame over the backend, the user's executable for the
// tables, and the port's title manifest.

import {
  openGame,
  pickExe,
  type ExeCandidate,
  type ExePick,
  type Game,
  type GameFs,
} from '@ez2bms/chart-core';
import { dirName, joinPath, type Backend } from '../bridge';
import { t } from '../i18n/i18n.svelte';
import type { Settings } from './settings.svelte';

/** The game folder as chart-core reads it: game-relative paths, forward slashes. */
export function gameFs(backend: Backend, root: string): GameFs {
  return {
    list: async (dir) =>
      (await backend.list(dir ? joinPath(root, dir) : root).catch(() => [])).map((e) => e.name),
    read: (p) => backend.readFile(joinPath(root, p)).catch(() => undefined),
  };
}

/**
 * The user's unpacked executable: the one set on the EZ2PORT panel first,
 * then every .exe in the game folder - each proved on the game's own
 * song.bin and key digests (chart-core pickExe), not taken because it maps
 * the address. With what each candidate held, to say why none was taken.
 */
export async function findExe(
  backend: Backend,
  settings: Settings,
  root: string,
): Promise<ExePick & { set?: string }> {
  const set = settings.data.exe ?? undefined;
  const candidates: ExeCandidate[] = [];
  if (set) {
    const bytes = await backend.readFile(set).catch(() => undefined);
    if (bytes) candidates.push({ name: set, bytes });
  }
  for (const e of await backend.list(root).catch(() => [])) {
    const path = joinPath(root, e.name);
    if (e.is_dir || !/\.exe$/i.test(e.name) || path === set) continue;
    const bytes = await backend.readFile(path).catch(() => undefined);
    if (bytes) candidates.push({ name: path, bytes });
  }
  return { ...(await pickExe(gameFs(backend, root), candidates)), ...(set ? { set } : {}) };
}

/** Why no executable was taken, for the top of the game's problems. */
function exeProblem(pick: ExePick & { set?: string }): string | undefined {
  if (pick.exe) return undefined;
  // Nothing to prove against (every song.bin plaintext) and no keys: the
  // charts say what they need when they are read.
  if (pick.checks.every((c) => c.songdb === undefined)) return undefined;
  const name = (p: string) => p.split(/[\\/]/).pop() ?? p;
  if (pick.set) return t('import.game.exeSetWrong', { file: name(pick.set) });
  if (!pick.checks.length) return t('import.game.exeNoFiles');
  return t('import.game.exeNone', { files: pick.checks.map((c) => name(c.name)).join(', ') });
}

/**
 * Open the configured game folder. Throws with what to set when there is
 * none. The browser build's made-up game brings made-up chart tables
 * (Backend.devGameTables), used only when the executable gives none.
 */
export async function loadGame(backend: Backend, settings: Settings): Promise<Game> {
  const root = settings.data.gameRoot;
  if (!root) throw new Error(t('import.game.noRoot'));
  const pick = await findExe(backend, settings, root);
  // The port's song titles: text/ beside ez2play, else in the game folder.
  const play = settings.data.ez2play;
  const manifestAt = [
    play && joinPath(joinPath(dirName(play), 'text'), 'manifest.songs.ini'),
    joinPath(joinPath(root, 'text'), 'manifest.songs.ini'),
  ];
  let manifest: string | undefined;
  for (const p of manifestAt) {
    if (!p) continue;
    const bytes = await backend.readFile(p).catch(() => undefined);
    if (bytes) {
      manifest = new TextDecoder().decode(bytes);
      break;
    }
  }
  const game = await openGame(
    gameFs(backend, root),
    pick.exe?.bytes,
    manifest,
    backend.devGameTables ? { tables: backend.devGameTables } : {},
  );
  // First: the importer and exporter show the first problem when no song reads.
  const why = exeProblem(pick);
  if (why) game.problems.unshift(why);
  return game;
}
