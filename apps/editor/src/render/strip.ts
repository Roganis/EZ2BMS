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
  /** CSS colours made so far (painting makes the same few, row after row). */
  private readonly styles = new Map<number, string>();

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
    const style = (rgb: number, a: number) => {
      const k = rgb * 128 + Math.round(a * 100);
      let v = this.styles.get(k);
      if (v === undefined) this.styles.set(k, (v = css(rgb, a)));
      return v;
    };
    // Each slice's band, one rectangle per run of rows, so its extent shows
    // even where it is quiet.
    let from = 0;
    for (let i = 1; i <= rows.length; i++) {
      const a = rows[from];
      const b = rows[i];
      if (i < rows.length && (a?.slice ?? -2) === (b?.slice ?? -2)) continue;
      if (a) {
        const lit = a.slice >= 0 && colors.lit(a.slice);
        const rgb = a.slice >= 0 ? colors.of(a.slice) : 0x7f8aa8;
        ctx.fillStyle = style(rgb, lit ? 0.16 : a.slice >= 0 && a.slice % 2 ? 0.07 : 0.04);
        ctx.fillRect(0, from * row, w, (i - from) * row);
      }
      from = i;
    }
    // The waveform over it.
    let last = '';
    rows.forEach((r, i) => {
      if (!r || r.loading) return;
      const lit = r.slice >= 0 && colors.lit(r.slice);
      const rgb = r.slice >= 0 ? colors.of(r.slice) : 0x7f8aa8;
      const fill = style(lit ? 0xffffff : rgb, lit ? 0.95 : 0.8);
      if (fill !== last) ctx.fillStyle = last = fill;
      const x0 = cx + r.lo * half;
      const x1 = cx + r.hi * half;
      ctx.fillRect(x0, i * row, Math.max(1, x1 - x0), row);
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
