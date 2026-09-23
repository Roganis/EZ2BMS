// A stem strip: the stem's audio on the chart's own tick axis, where the
// chart plays it (chart-core slice/view.ts). The tick axis is linear in
// beats, not in time, so the waveform is not simply scaled: each pixel row
// is a stretch of pulses, the plan timeline turns it into song time (the
// tempo map, STOPs as gaps - audio runs on through a STOP while the scroll
// holds), and the stretches of the file sounding then (a chain's slices, a
// retriggered loop heard again) give the part of the file to draw, from the
// engine's peak mipmap (audio/peaktiles.ts).
//
// Rows are worked out in ./striprows.ts, purely; the painter here puts them
// on a canvas that the playfield shows as one texture, painted again only
// when what it shows has changed.

import { CanvasSource, Texture } from 'pixi.js';
import type { StripRow } from './striprows';

export interface StripColors {
  /** RGB of a slice's waveform and band. */
  of(slice: number): number;
  /** A slice drawn brighter (hovered or selected). */
  lit(slice: number): boolean;
}

const css = (rgb: number, a: number) =>
  `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${a})`;

/** One strip's canvas and the texture that shows it. */
export class StripPainter {
  private readonly source = new CanvasSource({
    resource: document.createElement('canvas'),
    width: 1,
    height: 1,
  });
  readonly texture = new Texture({ source: this.source });
  /** What was last painted, so an unchanged strip is not painted again. */
  private key = '';

  /** Whether what `key` describes differs from what is painted. */
  stale(key: string): boolean {
    return key !== this.key;
  }

  paint(
    key: string,
    rows: readonly (StripRow | null)[],
    w: number,
    h: number,
    dpr: number,
    colors: StripColors,
    row = 1,
  ): void {
    if (key === this.key) return;
    this.key = key;
    const src = this.source;
    if (src.width !== w || src.height !== h || src.resolution !== dpr) src.resize(w, h, dpr);
    const ctx = src.context2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const half = w / 2 - 3;
    rows.forEach((r, i) => {
      if (!r) return;
      const y = i * row;
      const rgb = r.slice >= 0 ? colors.of(r.slice) : 0x7f8aa8;
      const lit = r.slice >= 0 && colors.lit(r.slice);
      // The slice's band, so its extent shows even where it is quiet.
      ctx.fillStyle = css(rgb, lit ? 0.16 : r.slice >= 0 && r.slice % 2 ? 0.07 : 0.04);
      ctx.fillRect(0, y, w, row);
      if (r.loading) return;
      ctx.fillStyle = css(lit ? 0xffffff : rgb, lit ? 0.95 : 0.8);
      const x0 = cx + r.lo * half;
      const x1 = cx + r.hi * half;
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), row);
    });
    src.update();
  }

  destroy(): void {
    this.texture.destroy(true);
  }
}

/** A key for StripPainter.paint: everything a strip's pixels depend on. */
export function stripKey(parts: (string | number | boolean | null | undefined)[]): string {
  return parts.join('|');
}
