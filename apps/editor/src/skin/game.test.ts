import { describe, expect, it } from 'vitest';
import { modeDef } from '@ez2bms/chart-core';
import { DEMO_GAME, demoSkinFiles } from '../bridge/demo-skin';
import { webBackend } from '../bridge/web';
import { beamColor, loadGameSkin, noteVariant, SkinNotFound, targetSway } from './game';

const fsOf = (files: Map<string, Uint8Array>) => webBackend(files);

describe('loadGameSkin', () => {
  it('reads a panel, its .gds and its art, whatever the case', async () => {
    const s = await loadGameSkin(fsOf(demoSkinFiles()), DEMO_GAME, '5k', 'P1');
    expect(s.path).toBe(`${DEMO_GAME}/system/StreetMix/panel/STYLE_StreetMix1_0.pvi`);
    expect(s.missing).toEqual([]);
    const cols = modeDef('5k').columns;
    expect([...s.lanes.keys()].sort()).toEqual(cols.map((c) => c.x).sort());
    cols.forEach((c, i) => {
      const lane = s.lanes.get(c.x)!;
      expect(lane.track).toBe(i);
      expect(lane.notes).toHaveLength(6);
      expect(lane.press?.blend).toBe('add');
      expect(lane.bar).not.toBeNull();
      expect(lane.beam).not.toBeNull();
    });
    expect(s.target?.frames).toHaveLength(6);
    expect(s.measure?.frames).toHaveLength(1);
    expect(s.keyPanel?.image.height).toBe(110);
    // TargetBar[0] at y 360, 6 tall: judged on its middle.
    expect(s.judgeY).toBe(363);
    expect(s.backdrop).toMatchObject({ x0: 36, y0: 0, y1: 363 });
  });

  it('keys out black and keeps the art otherwise opaque', async () => {
    const s = await loadGameSkin(fsOf(demoSkinFiles()), DEMO_GAME, '5k', 'P1');
    const glow = s.lanes.get(11)!.press!.image;
    // Column 0 of the glow is black in the file: transparent.
    expect(glow.rgba[3]).toBe(0);
    const note = s.lanes.get(11)!.notes[0]!;
    expect(note.rgba[3]).toBe(255);
  });

  it("takes 2P's panel, placed where that file puts it", async () => {
    const fs = fsOf(demoSkinFiles());
    const p1 = await loadGameSkin(fs, DEMO_GAME, '7k', 'P1');
    const p2 = await loadGameSkin(fs, DEMO_GAME, '7k', 'P2');
    expect(p2.player).toBe(1);
    expect(p2.lanes.get(1)!.x).toBeGreaterThan(p1.lanes.get(1)!.x + 200);
  });

  it('lists what is missing and still loads', async () => {
    const files = demoSkinFiles();
    for (const k of [...files.keys()]) if (/Press_white|Target_Bar_/i.test(k)) files.delete(k);
    const s = await loadGameSkin(fsOf(files), DEMO_GAME, '5k', 'P1');
    expect(s.missing).toEqual(expect.arrayContaining(['press_white.bmp', 'target_bar_0.bmp']));
    expect(s.lanes.get(11)!.press).toBeNull();
    expect(s.lanes.get(11)!.notes).toHaveLength(6);
    expect(s.target).toBeNull();
  });

  it('refuses a folder with no panel for the mode', async () => {
    await expect(
      loadGameSkin(fsOf(demoSkinFiles()), DEMO_GAME, '14k', 'P1'),
    ).rejects.toBeInstanceOf(SkinNotFound);
  });

  it("follows the .gds's lane order", async () => {
    const files = demoSkinFiles();
    const gds = [...files.keys()].find((k) => k.endsWith('streetmix.GDS'))!;
    // Keys 1 and 2 swapped in the descriptor: lane 11 now draws with Track3.
    const text = new TextDecoder()
      .decode(files.get(gds))
      .replace('Key=10,-1', 'Key=@@')
      .replace('Key=11,-1', 'Key=10,-1')
      .replace('Key=@@', 'Key=11,-1');
    files.set(gds, new TextEncoder().encode(text));
    const s = await loadGameSkin(fsOf(files), DEMO_GAME, '5k', 'P1');
    expect(s.lanes.get(11)!.track).toBe(2);
    expect(s.lanes.get(12)!.track).toBe(1);
  });

  it('puts 5KeyMix keys on Track2..6 without a .gds (the turntable is Track1)', async () => {
    const tracks = [10, 3, 4, 5, 6, 7, 11].map(
      (_, i) =>
        `[Track${i + 1}]\r\nEnable = 1\r\nCoord = ${40 + i * 30}, 0\r\nSize = 30, 363\r\nNoteAniTexture = "n_"\r\n`,
    );
    const files = new Map([
      [
        `${DEMO_GAME}/system/5KeyMix/panel/STYLE_5KeyMix1_0.pvi`,
        new TextEncoder().encode(`[General]\r\nNumberOfTrack = 7\r\n${tracks.join('')}`),
      ],
    ]);
    const s = await loadGameSkin(fsOf(files), DEMO_GAME, '5k-only', 'P1');
    expect([11, 12, 13, 14, 15].map((x) => s.lanes.get(x)!.track)).toEqual([1, 2, 3, 4, 5]);
    expect(s.lanes.get(11)!.x).toBe(70);
    expect(s.missing).toEqual(['n_0.bmp']);
  });
});

describe('the port counters', () => {
  it('picks the note variant by the position in the beat', () => {
    // 48 ticks a beat, six steps, stepped back one and floored at zero.
    expect([0, 7, 8, 15, 16, 24, 32, 40, 47, 48].map((t) => noteVariant(t, 6))).toEqual([
      0, 0, 0, 0, 1, 2, 3, 4, 4, 0,
    ]);
    expect(noteVariant(47, 3)).toBe(2);
    expect(noteVariant(40, 1)).toBe(0);
  });

  it('sways the target bar a pixel or two, repeating', () => {
    const v = Array.from({ length: 200 }, (_, i) => targetSway(i * 13));
    expect(Math.max(...v)).toBeLessThanOrEqual(2);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(-2);
    expect(new Set(v).size).toBeGreaterThan(1);
    for (const t of [0, 100, 777]) expect(targetSway(t)).toBe(targetSway(t + 1920));
  });

  it("scales the beam's colour the way the original draws it", () => {
    expect(beamColor({ r: 200, g: 0, b: 200, a: 150 })).toEqual({
      rgb: 0xff00ff,
      alpha: 150 / 255,
    });
    expect(beamColor({ r: 255, g: 100, b: 0, a: 255 }).rgb).toBe(0xff7f00);
  });
});
