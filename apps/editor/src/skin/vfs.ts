// The user's game folder as EZ2PORT reads it (ez2/vfs.c): every path
// component matched in any case, a texture reference tried as `.abm` first
// (the stem up to its first dot, as ez2_scr_asset_name cuts it) and then as
// written, every texture colour-keyed on exact black like the cabinet. The
// play field's skin (game.ts) and the select screen's art (select.ts) both
// read through it.

import { decodeAbm } from '@ez2bms/chart-core';
import type { Entry } from '../bridge/types';

/** The part of the Backend the loaders need. */
export interface SkinFs {
  list(dir: string): Promise<Entry[]>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface SkinImage {
  width: number;
  height: number;
  /** Top-down, straight (not premultiplied) RGBA; exact black has alpha 0. */
  rgba: Uint8Array;
}

/** Directory listings, cached for one load (a skin names dozens of files in a few folders). */
export class Vfs {
  private readonly lists = new Map<string, Promise<Entry[] | null>>();

  constructor(private readonly fs: SkinFs) {}

  private list(dir: string): Promise<Entry[] | null> {
    let p = this.lists.get(dir);
    if (!p) {
      p = this.fs.list(dir).catch(() => null);
      this.lists.set(dir, p);
    }
    return p;
  }

  /** ez2_vfs_resolve: `ref` under `dir`, one component at a time, any case. */
  async resolve(dir: string, ref: string): Promise<string | null> {
    let cur = dir.replace(/[\\/]+$/, '');
    for (const comp of ref.split(/[\\/]+/)) {
      if (!comp || comp === '.') continue;
      if (comp === '..') {
        cur = cur.slice(0, Math.max(0, cur.lastIndexOf('/')));
        continue;
      }
      const entries = await this.list(cur);
      const want = comp.toLowerCase();
      const hit =
        entries?.find((e) => e.name === comp) ??
        entries?.find((e) => !e.name.startsWith('.') && e.name.toLowerCase() === want);
      if (!hit) return null;
      cur = `${cur}/${hit.name}`;
    }
    return cur;
  }

  read(path: string): Promise<Uint8Array> {
    return this.fs.readFile(path);
  }

  /** ez2_vfs_child_ext: the first file in `dir` with this extension, any case. */
  async withExt(dir: string, ext: string): Promise<string | null> {
    const hit = (await this.list(dir))?.find(
      (e) => !e.is_dir && !e.name.startsWith('.') && e.name.toLowerCase().endsWith(ext),
    );
    return hit ? `${dir}/${hit.name}` : null;
  }
}

/** The .abm spelling of a reference: the stem up to the first dot, plus .abm. */
export function abmName(ref: string): string {
  const dot = ref.indexOf('.');
  return (dot < 0 ? ref : ref.slice(0, dot)) + '.abm';
}

/**
 * A texture as the port loads one: `ref` as .abm, then as written, under each
 * of `dirs` in turn; decoded and keyed. Null when the folder has none or it
 * cannot be read.
 */
export async function loadKeyed(
  vfs: Vfs,
  dirs: readonly string[],
  ref: string,
): Promise<SkinImage | null> {
  if (!ref) return null;
  let path: string | null = null;
  for (const d of dirs) {
    path = (await vfs.resolve(d, abmName(ref))) ?? (await vfs.resolve(d, ref));
    if (path) break;
  }
  if (!path) return null;
  try {
    const img = decodeAbm(await vfs.read(path), { colorKey: true });
    return { width: img.width, height: img.height, rgba: img.rgba };
  } catch {
    return null;
  }
}
