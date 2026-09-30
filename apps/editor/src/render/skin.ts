// The procedural neon skin: note heads, hold bodies and the selection ring,
// drawn once per lane size into textures (no filters - glow is baked in, which
// keeps WebKitGTK fast). Colours follow the EZ2 lane kinds: white and blue
// keys, red turntable, gold pedal, pink effectors. Heads are bars or orbs
// (geometry.ts `noteBox` says where each sits).

import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { LaneKind } from '@ez2bms/chart-core';
import { noteBox, type NoteShape } from './geometry';

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
  shape: NoteShape;
  head: Map<string, Texture>;
  /** Baked without padding above and below: stretched, it spans exactly the hold. */
  body: Map<string, Texture>;
  /** A hold's far end: a stub of the body across a bar, a half disc closing an orb's capsule. */
  cap: Map<string, Texture>;
  ring: Map<string, Texture>;
  /** The bar's ring whatever the shape, for notes drawn in the game's art (stretched to their height). */
  frame: Map<string, Texture>;
  chip: Texture;
  /** A small red cross: a background continuation (BmsTWO marks them the same way). */
  cross: Texture;
  /** A head's height in a key lane. */
  noteH: number;
  /** How far from a note's line a pointer still takes it (NoteBox.reach). */
  reach: number;
}

const key = (kind: LaneKind, w: number) => `${kind}:${Math.round(w)}`;

/** Every texture is drawn inside this margin, so a sprite sits at (x - PAD, y - PAD). */
export const PAD = 6;

export class NeonSkin {
  private cache: SkinTextures | undefined;
  private forScale = 0;

  constructor(private readonly renderer: Renderer) {}

  /** Textures for these lane widths at this scale and shape, rebuilt when any changes. */
  textures(
    lanes: { kind: LaneKind; width: number }[],
    scale: number,
    shape: NoteShape,
  ): SkinTextures {
    if (
      this.cache &&
      this.forScale === scale &&
      this.cache.shape === shape &&
      lanes.every((l) => this.cache!.head.has(key(l.kind, l.width)))
    ) {
      return this.cache;
    }
    this.destroy();
    const full = noteBox(shape, Infinity, scale);
    const t: SkinTextures = {
      shape,
      head: new Map(),
      body: new Map(),
      cap: new Map(),
      ring: new Map(),
      frame: new Map(),
      chip: this.chip(scale),
      cross: this.cross(scale),
      noteH: full.h,
      reach: full.reach,
    };
    for (const l of lanes) {
      const k = key(l.kind, l.width);
      if (t.head.has(k)) continue;
      const b = noteBox(shape, l.width, scale);
      const bar = shape === 'bar' ? b : noteBox('bar', l.width, scale);
      const body = this.body(l.kind, b.bodyW);
      const frame = this.ring(bar.w, bar.h);
      t.body.set(k, body);
      t.frame.set(k, frame);
      if (shape === 'round') {
        t.head.set(k, this.orb(l.kind, b.w));
        t.cap.set(k, this.cap(l.kind, b.bodyW));
        t.ring.set(k, this.orbRing(b.w));
      } else {
        t.head.set(k, this.head(l.kind, b.w, b.h));
        t.cap.set(k, body);
        t.ring.set(k, frame);
      }
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

  capFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.cap.get(key(kind, width)) ?? Texture.WHITE;
  }

  ringFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.ring.get(key(kind, width)) ?? Texture.WHITE;
  }

  frameFor(t: SkinTextures, kind: LaneKind, width: number): Texture {
    return t.frame.get(key(kind, width)) ?? Texture.WHITE;
  }

  /** Bake a drawing whose content sits in [0, w] x [0, h] plus PAD all round (or only at the sides). */
  private bake(g: Graphics, w: number, h: number, padY = PAD): Texture {
    const tex = this.renderer.generateTexture({
      target: g,
      frame: new Rectangle(0, PAD - padY, Math.ceil(w + 2 * PAD), Math.ceil(h + 2 * padY)),
      resolution: window.devicePixelRatio || 1,
      antialias: true,
    });
    g.destroy();
    return tex;
  }

  /** A bar head, `w` x `h`. */
  private head(kind: LaneKind, w: number, h: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const r = Math.min(3, h / 3);
    const o = PAD;
    // Soft glow halo, then the body, then a bright top edge.
    g.roundRect(o - 3, o - 3, w + 6, h + 6, r + 3).fill({ color: c, alpha: 0.12 });
    g.roundRect(o - 1.5, o - 1.5, w + 3, h + 3, r + 1.5).fill({ color: c, alpha: 0.22 });
    g.roundRect(o, o, w, h, r).fill({ color: c, alpha: 1 });
    g.roundRect(o + 1, o + 1, w - 2, Math.max(1, h * 0.35), r).fill({
      color: 0xffffff,
      alpha: 0.55,
    });
    g.rect(o + 1, o + h - 2, w - 2, 1).fill({ color: 0x000000, alpha: 0.25 });
    return this.bake(g, w, h);
  }

  /**
   * An orb head, `d` across: the bar's halo and dark lower edge, and its
   * bright top as a highlight up and to the left, so it reads as a ball.
   */
  private orb(kind: LaneKind, d: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const r = d / 2;
    const cx = PAD + r;
    const cy = PAD + r;
    g.circle(cx, cy, r + 3).fill({ color: c, alpha: 0.12 });
    g.circle(cx, cy, r + 1.5).fill({ color: c, alpha: 0.22 });
    g.circle(cx, cy, r).fill({ color: c, alpha: 1 });
    // Each arc from its own start: a path's first arc is joined to (0, 0).
    const a = Math.PI * 0.15;
    g.moveTo(cx + (r - 0.75) * Math.cos(a), cy + (r - 0.75) * Math.sin(a));
    g.arc(cx, cy, r - 0.75, a, Math.PI - a).stroke({
      width: 1.5,
      color: 0x000000,
      alpha: 0.25,
    });
    g.ellipse(cx - r * 0.22, cy - r * 0.38, r * 0.5, r * 0.3).fill({
      color: 0xffffff,
      alpha: 0.55,
    });
    return this.bake(g, d, d);
  }

  private body(kind: LaneKind, bw: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const o = PAD;
    g.rect(o, o, bw, 8).fill({ color: c, alpha: 0.3 });
    g.rect(o, o, 2, 8).fill({ color: c, alpha: 0.95 });
    g.rect(o + bw - 2, o, 2, 8).fill({ color: c, alpha: 0.95 });
    return this.bake(g, bw, 8, 0);
  }

  /**
   * The top half of a disc as wide as the body, its rim continuing the
   * body's two edges: set on a round hold's end, it closes the capsule.
   */
  private cap(kind: LaneKind, bw: number): Texture {
    const c = KIND_COLOR[kind];
    const g = new Graphics();
    const r = bw / 2;
    const cx = PAD + r;
    const cy = PAD + r;
    g.moveTo(cx - r, cy)
      .arc(cx, cy, r, Math.PI, 0)
      .fill({ color: c, alpha: 0.3 });
    g.moveTo(cx - r + 1, cy)
      .arc(cx, cy, r - 1, Math.PI, 0)
      .stroke({ width: 2, color: c, alpha: 0.95 });
    return this.bake(g, bw, r);
  }

  /** The selection ring around a bar, `w` x `h`. */
  private ring(w: number, h: number): Texture {
    const g = new Graphics();
    const o = PAD;
    g.roundRect(o - 3.5, o - 3.5, w + 7, h + 7, 5).stroke({ width: 3, color: NEON, alpha: 0.3 });
    g.roundRect(o - 1.5, o - 1.5, w + 3, h + 3, 4).stroke({ width: 1.5, color: NEON, alpha: 1 });
    return this.bake(g, w, h);
  }

  /** The selection ring around an orb, `d` across. */
  private orbRing(d: number): Texture {
    const g = new Graphics();
    const r = d / 2;
    const c = PAD + r;
    g.circle(c, c, r + 3.5).stroke({ width: 3, color: NEON, alpha: 0.3 });
    g.circle(c, c, r + 1.5).stroke({ width: 1.5, color: NEON, alpha: 1 });
    return this.bake(g, d, d);
  }

  private chip(scale: number): Texture {
    const g = new Graphics();
    const w = Math.round(17 * scale);
    const h = Math.max(4, Math.round(6 * scale));
    g.roundRect(PAD, PAD, w, h, 2).fill({ color: 0xffffff, alpha: 0.92 });
    return this.bake(g, w, h);
  }

  private cross(scale: number): Texture {
    const g = new Graphics();
    const r = Math.max(2.5, 3 * scale);
    g.moveTo(PAD, PAD)
      .lineTo(PAD + 2 * r, PAD + 2 * r)
      .moveTo(PAD + 2 * r, PAD)
      .lineTo(PAD, PAD + 2 * r)
      .stroke({ width: Math.max(1.5, 1.5 * scale), color: 0xff3b3b, alpha: 1 });
    return this.bake(g, 2 * r, 2 * r);
  }

  destroy(): void {
    const c = this.cache;
    if (!c) return;
    // A bar's cap is its body and its ring its frame: each texture once.
    const all = new Set([c.head, c.body, c.cap, c.ring, c.frame].flatMap((m) => [...m.values()]));
    for (const t of all) t.destroy(true);
    c.chip.destroy(true);
    c.cross.destroy(true);
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
