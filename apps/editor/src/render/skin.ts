// The procedural neon skin: note heads, hold bodies and the selection ring,
// drawn once per lane size into textures (no filters - glow is baked in, which
// keeps WebKitGTK fast). Colours follow the EZ2 lane kinds: white and blue
// keys, red turntable, gold pedal, pink effectors.

import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { LaneKind } from '@ez2bms/chart-core';

export const KIND_COLOR: Record<LaneKind, number> = {
  white: 0xf2f2ff,
  blue: 0x4d9eff,
  scratch: 0xed2e2e,
  pedal: 0xffd11f,
  effector: 0xff5a9e,
};

/** Lane background tints (very low alpha over the field). */
export const KIND_FILL: Record<LaneKind, [number, number]> = {
  white: [0xf2f2ff, 0.035],
  blue: [0x4d9eff, 0.06],
  scratch: [0xed2e2e, 0.07],
  pedal: [0xffd11f, 0.055],
  effector: [0xff5a9e, 0.05],
};

export const NEON = 0x58e1ff;
export const NEON_2 = 0xff4fd8;

export interface SkinTextures {
  head: Map<string, Texture>;
  body: Map<string, Texture>;
  ring: Map<string, Texture>;
  chip: Texture;
  noteH: number;
}

const key = (kind: LaneKind, w: number) => `${kind}:${Math.round(w)}`;

/** Every texture is drawn inside this margin, so a sprite sits at (x - PAD, y - PAD). */
export const PAD = 6;

export class NeonSkin {
  private cache: SkinTextures | undefined;
  private forScale = 0;

  constructor(private readonly renderer: Renderer) {}

  /** Textures for these lane widths at this scale, rebuilt when either changes. */
  textures(lanes: { kind: LaneKind; width: number }[], scale: number): SkinTextures {
    if (
      this.cache &&
      this.forScale === scale &&
      lanes.every((l) => this.cache!.head.has(key(l.kind, l.width)))
    ) {
      return this.cache;
    }
    this.destroy();
    const noteH = Math.max(6, Math.round(9 * scale));
    const t: SkinTextures = {
      head: new Map(),
      body: new Map(),
      ring: new Map(),
      chip: this.chip(scale),
      noteH,
    };
    for (const l of lanes) {
      const k = key(l.kind, l.width);
      if (t.head.has(k)) continue;
      t.head.set(k, this.head(l.kind, l.width, noteH));
      t.body.set(k, this.body(l.kind, l.width));
      t.ring.set(k, this.ring(l.width, noteH));
    }
    this.cache = t;
    this.forScale = scale;
    return t;
  }

  headFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.head.get(key(kind, width)) ?? Texture.WHITE;
  }

  bodyFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.body.get(key(kind, width)) ?? Texture.WHITE;
  }

  ringFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.ring.get(key(kind, width)) ?? Texture.WHITE;
  }

  /** Bake a drawing whose content sits in [0, w] x [0, h] plus PAD all round. */
  private bake(g: Graphics, w: number, h: number): Texture {
    const tex = this.renderer.generateTexture({
      target: g,
      frame: new Rectangle(0, 0, Math.ceil(w + 2 * PAD), Math.ceil(h + 2 * PAD)),
      resolution: window.devicePixelRatio || 1,
      antialias: true,
    });
    g.destroy();
    return tex;
  }

  private head(kind: LaneKind, w: number, h: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const iw = Math.max(4, w - 2);
    const r = Math.min(3, h / 3);
    const o = PAD;
    // Soft glow halo, then the body, then a bright top edge.
    g.roundRect(o - 3, o - 3, iw + 6, h + 6, r + 3).fill({ color: c, alpha: 0.12 });
    g.roundRect(o - 1.5, o - 1.5, iw + 3, h + 3, r + 1.5).fill({ color: c, alpha: 0.22 });
    g.roundRect(o, o, iw, h, r).fill({ color: c, alpha: 1 });
    g.roundRect(o + 1, o + 1, iw - 2, Math.max(1, h * 0.35), r).fill({
      color: 0xffffff,
      alpha: 0.55,
    });
    g.rect(o + 1, o + h - 2, iw - 2, 1).fill({ color: 0x000000, alpha: 0.25 });
    return this.bake(g, iw, h);
  }

  private body(kind: LaneKind, w: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const bw = Math.max(4, Math.round(w * 0.72));
    const o = PAD;
    g.rect(o, o, bw, 8).fill({ color: c, alpha: 0.3 });
    g.rect(o, o, 2, 8).fill({ color: c, alpha: 0.95 });
    g.rect(o + bw - 2, o, 2, 8).fill({ color: c, alpha: 0.95 });
    return this.bake(g, bw, 8);
  }

  private ring(w: number, h: number): Texture {
    const g = new Graphics();
    const iw = Math.max(4, w - 2);
    const o = PAD;
    g.roundRect(o - 3.5, o - 3.5, iw + 7, h + 7, 5).stroke({ width: 3, color: NEON, alpha: 0.3 });
    g.roundRect(o - 1.5, o - 1.5, iw + 3, h + 3, 4).stroke({ width: 1.5, color: NEON, alpha: 1 });
    return this.bake(g, iw, h);
  }

  private chip(scale: number): Texture {
    const g = new Graphics();
    const w = Math.round(17 * scale);
    const h = Math.max(4, Math.round(6 * scale));
    g.roundRect(PAD, PAD, w, h, 2).fill({ color: 0xffffff, alpha: 0.92 });
    return this.bake(g, w, h);
  }

  destroy(): void {
    if (!this.cache) return;
    for (const m of [this.cache.head, this.cache.body, this.cache.ring])
      for (const t of m.values()) t.destroy(true);
    this.cache.chip.destroy(true);
    this.cache = undefined;
  }
}

/** HSL (h in degrees) to a 0xRRGGBB number. */
export function hsl(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
