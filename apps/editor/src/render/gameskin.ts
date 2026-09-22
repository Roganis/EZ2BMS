// The game skin's images as Pixi textures, made once per loaded skin.
//
// A hold is the port's three-slice bar (scene/skin.c, Panel::m42a630): the
// note texture's top half as the tail cap, ONE texel row from its middle
// stretched down the body, the bottom half as the head - so the caps keep
// their shading however long the hold is. Those slices are frames on the
// same GPU texture.

import { BufferImageSource, Rectangle, Texture } from 'pixi.js';
import type { GameSkin, SkinImage } from '../skin/game';

export interface NoteTextures {
  full: Texture;
  top: Texture;
  mid: Texture;
  bottom: Texture;
  /** Design pixels. */
  w: number;
  h: number;
}

export interface LaneTextures {
  notes: NoteTextures[];
  press: Texture | null;
  bar: Texture | null;
}

/** Straight RGBA to a premultiplied texture (what Pixi blends with). */
function texture(img: SkinImage): Texture {
  const px = new Uint8Array(img.rgba.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = img.rgba[i + 3]!;
    px[i] = (img.rgba[i]! * a + 127) / 255;
    px[i + 1] = (img.rgba[i + 1]! * a + 127) / 255;
    px[i + 2] = (img.rgba[i + 2]! * a + 127) / 255;
    px[i + 3] = a;
  }
  return new Texture({
    source: new BufferImageSource({
      resource: px,
      width: img.width,
      height: img.height,
      // A Uint8Array would otherwise be read as BGRA.
      format: 'rgba8unorm',
      alphaMode: 'premultiplied-alpha',
    }),
  });
}

/** A vertical white fade, opaque at one end: the beam lines trailing each note. */
function fade(opaqueAtTop: boolean): Texture {
  const h = 64;
  const rgba = new Uint8Array(h * 4).fill(255);
  for (let y = 0; y < h; y++)
    rgba[y * 4 + 3] = Math.round(255 * (opaqueAtTop ? 1 - y / (h - 1) : y / (h - 1)));
  return texture({ width: 1, height: h, rgba });
}

function noteTextures(img: SkinImage): NoteTextures {
  const full = texture(img);
  const { width: w, height: h } = img;
  const half = h / 2;
  const frame = (y: number, fh: number) =>
    new Texture({ source: full.source, frame: new Rectangle(0, y, w, fh) });
  return {
    full,
    top: frame(0, half),
    mid: frame(Math.min(h - 1, Math.floor(half)), 1),
    bottom: frame(half, half),
    w,
    h,
  };
}

export class GameSkinTextures {
  readonly lanes = new Map<number, LaneTextures>();
  readonly target: Texture[];
  readonly measure: Texture[];
  readonly keyPanel: Texture | null;
  /** Beam line textures: fading upward from a note, and downward. */
  readonly beamUp = fade(false);
  readonly beamDown = fade(true);

  constructor(readonly skin: GameSkin) {
    for (const [x, l] of skin.lanes) {
      this.lanes.set(x, {
        notes: l.notes.map(noteTextures),
        press: l.press ? texture(l.press.image) : null,
        bar: l.bar ? texture(l.bar.image) : null,
      });
    }
    this.target = skin.target?.frames.map(texture) ?? [];
    this.measure = skin.measure?.frames.map(texture) ?? [];
    this.keyPanel = skin.keyPanel ? texture(skin.keyPanel.image) : null;
  }

  destroy(): void {
    const all: Texture[] = [this.beamUp, this.beamDown, ...this.target, ...this.measure];
    if (this.keyPanel) all.push(this.keyPanel);
    for (const l of this.lanes.values()) {
      for (const n of l.notes) all.push(n.full);
      if (l.press) all.push(l.press);
      if (l.bar) all.push(l.bar);
    }
    // Destroying the source also frees the slices that share it.
    for (const t of all) t.destroy(true);
  }
}
