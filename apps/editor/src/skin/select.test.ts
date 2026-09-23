import { encodeAbm } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { DEMO_GAME, demoSkinFiles } from '../bridge/demo-skin';
import { webBackend } from '../bridge/web';
import { loadSelectArt } from './select';

describe('the select screen art', () => {
  it('is found in any case, as .abm for a .bmp name, keyed on black', async () => {
    const rgb = new Uint8Array(4 * 4 * 3).fill(200);
    rgb.fill(0, 0, 3); // one black pixel: the key
    const files = new Map<string, Uint8Array>([
      ['/g/SYSTEM/Disc/Disc-Mask.abm', encodeAbm(rgb, 4, 4)],
      ['/g/SYSTEM/songselect/vf/B_MASK_2.ABM', encodeAbm(rgb, 4, 4)],
    ]);
    const art = await loadSelectArt(webBackend(files), '/g');
    expect(art.discMask?.width).toBe(4);
    expect(art.discMask?.rgba[3]).toBe(0);
    expect(art.discMask?.rgba[7]).toBe(255);
    expect(art.railStrip).not.toBeNull();
    expect(art.shapeMask).toBeNull();
    expect(art.missing).toEqual([
      'system\\disc\\shape_mask.bmp',
      'system\\Channel_Eyecatch\\common\\Stage_Mask.bmp',
      'system\\Channel_Eyecatch\\common\\Stage_1.bmp',
    ]);
  });

  it("is all in the demo's made-up game folder", async () => {
    const art = await loadSelectArt(webBackend(demoSkinFiles()), DEMO_GAME);
    expect(art.missing).toEqual([]);
    expect(art.stagePlate?.width).toBe(640);
    // Round the disc is the key; inside it is not.
    expect(art.discMask?.rgba[3]).toBe(0);
    expect(art.discMask?.rgba[(64 * 128 + 64) * 4 + 3]).toBe(255);
  });
});
