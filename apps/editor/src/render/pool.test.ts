import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { RectPool, Shapes, TextPool } from './pool';

/** A Graphics that counts what it is asked to do. */
function spy() {
  const calls: string[] = [];
  const g = {
    clear: () => (calls.push('clear'), g),
    rect: (...a: number[]) => (calls.push(`rect ${a.join(' ')}`), g),
    roundRect: (...a: number[]) => (calls.push(`roundRect ${a.join(' ')}`), g),
    circle: (...a: number[]) => (calls.push(`circle ${a.join(' ')}`), g),
    poly: (p: number[]) => (calls.push(`poly ${p.join(' ')}`), g),
    moveTo: (...a: number[]) => (calls.push(`moveTo ${a.join(' ')}`), g),
    lineTo: (...a: number[]) => (calls.push(`lineTo ${a.join(' ')}`), g),
    fill: (s: unknown) => (calls.push(`fill ${JSON.stringify(s)}`), g),
    stroke: (s: unknown) => (calls.push(`stroke ${JSON.stringify(s)}`), g),
  };
  return { g: g as unknown as Graphics, calls };
}

const frame = (sh: Shapes, y: number, alpha = 0.5) => {
  sh.clear();
  sh.rect(0, y, 10, 2).fill({ color: 0xffffff, alpha });
  sh.poly([0, 0, 4, 2, 0, 4]).fill({ color: 0x58e1ff, alpha: 1 });
  sh.circle(5, y, 4).fill({ color: 0xffd11f, alpha: 0.35 });
  sh.moveTo(0, y).lineTo(9, y).stroke({ width: 1, color: 0xff0000, alpha: 0.5 });
  sh.commit();
};

describe('Shapes', () => {
  it('replays a frame onto the Graphics, in order', () => {
    const { g, calls } = spy();
    frame(new Shapes(g), 3);
    expect(calls).toEqual([
      'clear',
      'rect 0 3 10 2',
      'fill {"color":16777215,"alpha":0.5}',
      'poly 0 0 4 2 0 4',
      'fill {"color":5825023,"alpha":1}',
      'circle 5 3 4',
      'fill {"color":16765215,"alpha":0.35}',
      'moveTo 0 3',
      'lineTo 9 3',
      'stroke {"width":1,"color":16711680,"alpha":0.5}',
    ]);
  });

  it('leaves the Graphics alone while frames look the same', () => {
    const { g, calls } = spy();
    const sh = new Shapes(g);
    frame(sh, 3);
    const n = calls.length;
    frame(sh, 3);
    frame(sh, 3);
    expect(calls.length).toBe(n);
    // A moved shape or a changed style draws again; going back draws again too.
    frame(sh, 4);
    expect(calls.length).toBe(2 * n);
    frame(sh, 4, 0.6);
    expect(calls.length).toBe(3 * n);
    frame(sh, 3);
    expect(calls.length).toBe(4 * n);
    frame(sh, 3);
    expect(calls.length).toBe(4 * n);
  });

  it('clears the Graphics when a frame draws nothing after one that did', () => {
    const { g, calls } = spy();
    const sh = new Shapes(g);
    frame(sh, 3);
    calls.length = 0;
    sh.clear();
    sh.commit();
    expect(calls).toEqual(['clear']);
    sh.clear();
    sh.commit();
    expect(calls).toEqual(['clear']);
  });
});

describe('RectPool', () => {
  it('sizes white sprites as rectangles and hides what a frame does not use', () => {
    const parent = new Container();
    const pool = new RectPool(parent);
    pool.begin();
    pool.rect(5, 6, 30, 2, 0xff0000, 0.5);
    pool.rect(1, 2, 3, 4, 0x00ff00);
    pool.end();
    expect(parent.children.length).toBe(2);
    const [a, b] = parent.children as import('pixi.js').Sprite[];
    expect(a!.texture).toBe(Texture.WHITE);
    expect([a!.x, a!.y, a!.width, a!.height, a!.tint, a!.alpha]).toEqual([
      5, 6, 30, 2, 0xff0000, 0.5,
    ]);
    expect([b!.width, b!.height, b!.tint, b!.alpha]).toEqual([3, 4, 0x00ff00, 1]);
    pool.begin();
    pool.rect(0, 0, 1, 1, 0xffffff);
    pool.end();
    expect(parent.children.length).toBe(2);
    expect(a!.visible).toBe(true);
    expect(b!.visible).toBe(false);
  });
});

describe('TextPool', () => {
  it('keeps each label on the object that showed the same words', () => {
    const parent = new Container();
    const pool = new TextPool(parent, { fontFamily: 'monospace', fontSize: 11 });
    pool.begin();
    const [a, b, c] = ['#001', '#002', '#003'].map((s) => pool.next(s));
    pool.end();
    // A measure scrolled off the bottom and a new one came in at the top:
    // the ones still on screen keep their objects, the new one takes the free one.
    pool.begin();
    const b2 = pool.next('#002');
    const c2 = pool.next('#003');
    const d = pool.next('#004');
    pool.end();
    expect(b2).toBe(b);
    expect(c2).toBe(c);
    expect(d).toBe(a);
    expect(d!.text).toBe('#004');
    expect(parent.children.length).toBe(3);
    // The same words twice in a frame get two objects.
    pool.begin();
    const e = pool.next('#002');
    const f = pool.next('#002');
    pool.end();
    expect(e).toBe(b);
    expect(f).not.toBe(b);
    expect(f!.text).toBe('#002');
    expect([a, b, c].filter((t) => t!.visible).length).toBe(2);
  });

  it('scales and tints what it hands out', () => {
    const pool = new TextPool(new Container(), { fontFamily: 'monospace', fontSize: 11 });
    pool.begin();
    const t = pool.next('BPM', 0.75, Infinity, 0xffd11f);
    expect([t.scale.x, t.scale.y, t.tint]).toEqual([0.75, 0.75, 0xffd11f]);
    pool.end();
    pool.begin();
    const u = pool.next('BPM');
    expect(u).toBe(t);
    expect([u.scale.x, u.tint]).toEqual([1, 0xffffff]);
  });
});
