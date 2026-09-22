// A basic title plate for the song wheel (songname.abm, 256x32): the title in
// white with a neon edge on black, which the game treats as transparent. The
// plate designer (fonts, CJK, era colours) is Milestone 3.

import { encodeAbm } from '@ez2bms/chart-core';

export const PLATE_W = 256;
export const PLATE_H = 32;

export function renderPlate(title: string): Uint8Array | undefined {
  const c = document.createElement('canvas');
  c.width = PLATE_W;
  c.height = PLATE_H;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.fillStyle = '#000';
  g.fillRect(0, 0, PLATE_W, PLATE_H);
  let size = 22;
  const font = (s: number) => `bold ${s}px "Segoe UI", "Noto Sans", sans-serif`;
  g.font = font(size);
  while (size > 10 && g.measureText(title).width > PLATE_W - 12) g.font = font(--size);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.shadowColor = '#58e1ff';
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.fillText(title, PLATE_W / 2, PLATE_H / 2 + 1, PLATE_W - 8);
  const rgba = g.getImageData(0, 0, PLATE_W, PLATE_H).data;
  const rgb = new Uint8Array(PLATE_W * PLATE_H * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return encodeAbm(rgb, PLATE_W, PLATE_H);
}
