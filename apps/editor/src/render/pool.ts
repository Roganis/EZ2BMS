// Reuse display objects frame to frame instead of creating and destroying
// thousands of them: take what a frame needs, hide the rest.

import {
  BitmapText,
  Container,
  Graphics,
  Sprite,
  Texture,
  type FillInput,
  type StrokeInput,
  type TextStyleOptions,
} from 'pixi.js';

/**
 * Tint a display object only when the colour changes: Pixi's setter makes
 * an array to convert the colour even when it is the same, on every sprite,
 * every frame.
 */
export function tint(o: Container, color: number): void {
  if (o.tint !== color) o.tint = color;
}

export class SpritePool {
  private readonly items: Sprite[] = [];
  private used = 0;

  constructor(private readonly parent: Container) {}

  begin(): void {
    this.used = 0;
  }

  /** A sprite showing `texture` at its natural size, tinted `color`. */
  next(texture: Texture, color = 0xffffff): Sprite {
    let s = this.items[this.used];
    if (!s) {
      s = new Sprite(texture);
      s.eventMode = 'none';
      this.items.push(s);
      this.parent.addChild(s);
    } else if (s.texture !== texture) {
      s.texture = texture;
    }
    s.visible = true;
    s.alpha = 1;
    tint(s, color);
    // A sprite sized for one texture keeps that scale on the next; start from natural size.
    if (s.scale.x !== 1 || s.scale.y !== 1) s.scale.set(1, 1);
    this.used++;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }

  get count(): number {
    return this.used;
  }
}

/**
 * Filled rectangles as sprites of Pixi's 1x1 white texture, scaled and
 * tinted. What scrolls with the chart (grid lines, strip marks, hold
 * ticks) moves every frame while playing: a Graphics would be cleared and
 * triangulated again each time, leaving garbage the page must stop to
 * collect (docs/perf-log.md, 2026-09-28); a sprite only moves, and all of
 * them go in one batch.
 */
export class RectPool {
  private readonly items: Sprite[] = [];
  private used = 0;

  constructor(private readonly parent: Container) {}

  begin(): void {
    this.used = 0;
  }

  /** A rectangle at (x, y), w x h pixels (as Graphics.rect(...).fill({ color, alpha })). */
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    let s = this.items[this.used];
    if (!s) {
      s = new Sprite(Texture.WHITE);
      s.eventMode = 'none';
      this.items.push(s);
      this.parent.addChild(s);
    }
    s.visible = true;
    s.position.set(x, y);
    s.scale.set(w, h);
    tint(s, color);
    s.alpha = alpha;
    this.used++;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }

  get count(): number {
    return this.used;
  }
}

/**
 * Labels, each kept on the object that showed the same words last frame.
 * Changing a BitmapText's text lays it out and builds its glyph quads
 * again, and reading its size after that measures every glyph; handing out
 * objects in draw order would give every label new words each time a
 * measure scrolled off the top, on every frame of playing.
 */
export class TextPool {
  private readonly items: BitmapText[] = [];
  /** What each item was asked to show (it may show less: cut to fit). */
  private readonly asked: string[] = [];
  /** The room and scale its words were cut for. */
  private readonly room: number[] = [];
  private readonly scaled: number[] = [];
  /** The frame each item was last used in. */
  private readonly stamp: number[] = [];
  /** Words -> an item asked for them. */
  private readonly byText = new Map<string, number>();
  private frame = 0;
  /** Cursors for handing out items: those hidden last frame, then any unused this frame. */
  private stale = 0;
  private spare = 0;

  constructor(
    private readonly parent: Container,
    private readonly style: TextStyleOptions,
  ) {}

  begin(): void {
    this.frame++;
    this.stale = 0;
    this.spare = 0;
  }

  /**
   * A label showing `text` at `scale`, cut with an ellipsis to `room`
   * pixels wide when given, tinted `color`. Alpha and position are the caller's.
   */
  next(text: string, scale = 1, room = Infinity, color = 0xffffff): BitmapText {
    let i = this.byText.get(text);
    if (i === undefined || this.stamp[i] === this.frame) i = this.take();
    const t = this.items[i]!;
    if (this.asked[i] !== text || this.room[i] !== room || this.scaled[i] !== scale) {
      if (this.byText.get(this.asked[i]!) === i) this.byText.delete(this.asked[i]!);
      this.asked[i] = text;
      this.room[i] = room;
      this.scaled[i] = scale;
      if (!this.byText.has(text)) this.byText.set(text, i);
      if (t.scale.x !== scale || t.scale.y !== scale) t.scale.set(scale);
      t.text = text;
      // Cut long words to the room rather than let them run over what is next.
      if (room < Infinity && t.width > room) {
        const keep = Math.max(1, Math.floor((text.length * room) / t.width) - 1);
        t.text = `${text.slice(0, keep)}…`;
      }
    }
    this.stamp[i] = this.frame;
    t.visible = true;
    t.alpha = 1;
    tint(t, color);
    return t;
  }

  end(): void {
    for (let i = 0; i < this.items.length; i++)
      if (this.stamp[i] !== this.frame) this.items[i]!.visible = false;
  }

  private take(): number {
    const n = this.items.length;
    while (this.stale < n && this.stamp[this.stale]! >= this.frame - 1) this.stale++;
    if (this.stale < n) return this.stale++;
    while (this.spare < n && this.stamp[this.spare] === this.frame) this.spare++;
    if (this.spare < n) return this.spare++;
    const t = new BitmapText({ text: '', style: this.style });
    t.eventMode = 'none';
    this.items.push(t);
    this.asked.push('');
    this.room.push(Infinity);
    this.scaled.push(1);
    this.stamp.push(0);
    this.parent.addChild(t);
    return n;
  }
}

// Shapes' recorded calls: an op code, then its numbers (a poly: its count first).
const RECT = 0;
const ROUND = 1;
const POLY = 2;
const MOVE = 3;
const LINE = 4;
const FILL = 5;
const STROKE = 6;

/** One frame's calls: numbers, and the styles the fills and strokes name by index. */
class Recording {
  nums: number[] = [];
  styles: (FillInput | StrokeInput)[] = [];

  reset(): void {
    this.nums.length = 0;
    this.styles.length = 0;
  }

  same(o: Recording): boolean {
    const a = this.nums;
    const b = o.nums;
    if (a.length !== b.length || this.styles.length !== o.styles.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    for (let i = 0; i < this.styles.length; i++)
      if (!sameStyle(this.styles[i]!, o.styles[i]!)) return false;
    return true;
  }
}

/**
 * A Graphics drawn again only when a frame's shapes differ from the last
 * frame's. Pixi rebuilds a Graphics' geometry whenever it is cleared, so a
 * layer that looks the same every frame while the chart plays (the lanes,
 * the rack's columns, the judge line) would be triangulated for nothing.
 * The calls mirror Graphics'; they are recorded, compared, and replayed.
 */
export class Shapes {
  private cur = new Recording();
  private last = new Recording();

  constructor(readonly g: Graphics) {}

  clear(): this {
    this.cur.reset();
    return this;
  }

  rect(x: number, y: number, w: number, h: number): this {
    this.cur.nums.push(RECT, x, y, w, h);
    return this;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number): this {
    this.cur.nums.push(ROUND, x, y, w, h, r);
    return this;
  }

  poly(points: readonly number[]): this {
    this.cur.nums.push(POLY, points.length, ...points);
    return this;
  }

  moveTo(x: number, y: number): this {
    this.cur.nums.push(MOVE, x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.cur.nums.push(LINE, x, y);
    return this;
  }

  fill(s: FillInput): this {
    this.cur.nums.push(FILL, this.cur.styles.push(s) - 1);
    return this;
  }

  stroke(s: StrokeInput): this {
    this.cur.nums.push(STROKE, this.cur.styles.push(s) - 1);
    return this;
  }

  /** Put this frame's shapes on the Graphics, unless they are the last frame's. */
  commit(): void {
    const r = this.cur;
    if (r.same(this.last)) return;
    const g = this.g;
    const n = r.nums;
    g.clear();
    for (let i = 0; i < n.length;) {
      switch (n[i++]) {
        case RECT:
          g.rect(n[i]!, n[i + 1]!, n[i + 2]!, n[i + 3]!);
          i += 4;
          break;
        case ROUND:
          g.roundRect(n[i]!, n[i + 1]!, n[i + 2]!, n[i + 3]!, n[i + 4]!);
          i += 5;
          break;
        case POLY: {
          const k = n[i++]!;
          g.poly(n.slice(i, i + k));
          i += k;
          break;
        }
        case MOVE:
          g.moveTo(n[i]!, n[i + 1]!);
          i += 2;
          break;
        case LINE:
          g.lineTo(n[i]!, n[i + 1]!);
          i += 2;
          break;
        case FILL:
          g.fill(r.styles[n[i++]!] as FillInput);
          break;
        default:
          g.stroke(r.styles[n[i++]!] as StrokeInput);
      }
    }
    // Kept to compare the next frame with; that one records into the other.
    this.cur = this.last;
    this.last = r;
  }
}

/** Styles as the renderer writes them: a colour and alpha (and a width), or one shared gradient. */
function sameStyle(a: FillInput | StrokeInput, b: FillInput | StrokeInput): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k in x) if (x[k] !== y[k]) return false;
  for (const k in y) if (!(k in x)) return false;
  return true;
}
