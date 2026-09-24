// The configured EZ2AC data folder, read the same way for importing a song
// from it (importer.svelte.ts) and exporting one back (exporter.svelte.ts):
// chart-core's openGame over the backend, the user's executable for the
// tables, and the port's title manifest.

import {
  exeRead,
  keyTableFromExe,
  openGame,
  SONGDB_TABLE_SIZE,
  SONGDB_TABLE_VA,
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
 * The user's unpacked executable: the one set, else (as EZ2PORT does) the
 * first .exe in the game folder whose bytes hold the keys.
 */
export async function findExe(
  backend: Backend,
  settings: Settings,
  root: string,
): Promise<Uint8Array | undefined> {
  const set = settings.data.exe;
  if (set) return backend.readFile(set).catch(() => undefined);
  for (const e of await backend.list(root).catch(() => [])) {
    if (e.is_dir || !/\.exe$/i.test(e.name)) continue;
    const bytes = await backend.readFile(joinPath(root, e.name)).catch(() => undefined);
    if (!bytes) continue;
    try {
      keyTableFromExe(bytes, 'ez');
      return bytes;
    } catch {
      try {
        exeRead(bytes, SONGDB_TABLE_VA, SONGDB_TABLE_SIZE);
        return bytes;
      } catch {
        // not this one
      }
    }
  }
  return undefined;
}

/**
 * Open the configured game folder. Throws with what to set when there is
 * none. The browser build's made-up game brings made-up chart tables
 * (Backend.devGameTables), used only when the executable gives none.
 */
export async function loadGame(backend: Backend, settings: Settings): Promise<Game> {
  const root = settings.data.gameRoot;
  if (!root) throw new Error(t('import.game.noRoot'));
  const exe = await findExe(backend, settings, root);
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
  return openGame(
    gameFs(backend, root),
    exe,
    manifest,
    backend.devGameTables ? { tables: backend.devGameTables } : {},
  );
}
