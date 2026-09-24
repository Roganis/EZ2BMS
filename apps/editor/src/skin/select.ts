// The select screen's own art, read from the user's game folder as EZ2PORT's
// select screen reads it (tools/ez2play/select.c: select_refresh and
// select_eyecatch): the disc's base and ring masks under and over the
// focused disc, the strip behind the title rail, and the mask and plate the
// exit eyecatch is drawn under. What the folder lacks is listed; the wheel
// preview draws a neon stand-in for it. The screen's animated parts (.str:
// the backdrop, the rail's cursor, the frame) are Milestone 8's.

import { loadKeyed, Vfs, type SkinFs, type SkinImage } from './vfs';

export interface SelectArt {
  /** system\disc\disc-mask.bmp: multiplied under the disc, twice, turning with it. */
  discMask: SkinImage | null;
  /** system\disc\shape_mask.bmp: multiplied over it, still. */
  shapeMask: SkinImage | null;
  /** System\SongSelect\VF\b_mask_2.bmp: multiplied behind the plates, stretched 490 tall. */
  railStrip: SkinImage | null;
  /** system\Channel_Eyecatch\common\Stage_Mask.bmp: multiplied over the eyecatch. */
  stageMask: SkinImage | null;
  /** ...\Stage_1.bmp: the stage plate, added over both. */
  stagePlate: SkinImage | null;
  /** The files the folder does not have. */
  missing: string[];
}

export const SELECT_FILES = {
  discMask: 'system\\disc\\disc-mask.bmp',
  shapeMask: 'system\\disc\\shape_mask.bmp',
  railStrip: 'system\\SongSelect\\VF\\b_mask_2.bmp',
  stageMask: 'system\\Channel_Eyecatch\\common\\Stage_Mask.bmp',
  stagePlate: 'system\\Channel_Eyecatch\\common\\Stage_1.bmp',
} as const;

export async function loadSelectArt(fs: SkinFs, root: string): Promise<SelectArt> {
  const vfs = new Vfs(fs);
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const missing: string[] = [];
  const get = async (ref: string) => {
    const img = await loadKeyed(vfs, [base], ref);
    if (!img) missing.push(ref);
    return img;
  };
  return {
    discMask: await get(SELECT_FILES.discMask),
    shapeMask: await get(SELECT_FILES.shapeMask),
    railStrip: await get(SELECT_FILES.railStrip),
    stageMask: await get(SELECT_FILES.stageMask),
    stagePlate: await get(SELECT_FILES.stagePlate),
    missing,
  };
}
