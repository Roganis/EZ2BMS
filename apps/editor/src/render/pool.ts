// Reuse display objects frame to frame instead of creating and destroying
// thousands of them: take what a frame needs, hide the rest.

import { BitmapText, Container, Sprite, Texture, type TextStyleOptions } from 'pixi.js';

export class SpritePool {
  private readonly items: Sprite[] = [];
  private used = 0;

  constructor(private readonly parent: Container) {}

  begin(): void {
    this.used = 0;
  }

  next(texture: Texture): Sprite {
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
    s.tint = 0xffffff;
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

export class TextPool {
  private readonly items: BitmapText[] = [];
  private used = 0;

  constructor(
    private readonly parent: Container,
    private readonly style: TextStyleOptions,
  ) {}

  begin(): void {
    this.used = 0;
  }

  next(text: string): BitmapText {
    let t = this.items[this.used];
    if (!t) {
      t = new BitmapText({ text, style: this.style });
      t.eventMode = 'none';
      this.items.push(t);
      this.parent.addChild(t);
    } else if (t.text !== text) {
      t.text = text;
    }
    t.visible = true;
    t.alpha = 1;
    t.tint = 0xffffff;
    this.used++;
    return t;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }
}
