// Stem strips: the demo's stem shown beside the lanes where the chart plays
// it - each slice in its own tint, its silent bar silent - the slice under
// the pointer lit, and which files have strips remembered per song. The
// browser build's stem is a made-up 150 BPM pattern (bridge/demo.ts
// demoStem); the row mapping itself is unit-tested (render/striprows.test).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any; __ez2bmsField: any };

const MEASURE = 4 * 240;

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
}

const strips = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as W).__ez2bmsField;
    return f.currentLayout.strips.length as number;
  });

async function goto(page: Page, pulse: number) {
  await page.evaluate((p) => ((window as unknown as W).__ez2bms.view.cursor = p), pulse);
  await page.waitForTimeout(250);
}

/**
 * The strip's painted pixels over the pulses [a, b): how many are bright
 * (the waveform) and the mean colour of those.
 */
const pixels = (page: Page, a: number, b: number) =>
  page.evaluate(
    ([a, b]) => {
      const f = (window as unknown as W).__ez2bmsField;
      const p = f.painters.get('stem_pad.wav');
      const canvas = p.painter.source.resource as HTMLCanvasElement;
      const k = canvas.height / f.currentLayout.height;
      const y0 = Math.max(0, Math.round(f.yOf(b) * k));
      const y1 = Math.min(canvas.height, Math.round(f.yOf(a) * k));
      const img = canvas.getContext('2d')!.getImageData(0, y0, canvas.width, y1 - y0).data;
      let n = 0;
      const sum = [0, 0, 0];
      for (let i = 0; i < img.length; i += 4) {
        if (img[i + 3]! < 150) continue;
        n++;
        for (let c = 0; c < 3; c++) sum[c]! += img[i + c]!;
      }
      return { bright: n, rgb: sum.map((v) => (n ? Math.round(v / n) : 0)) };
    },
    [a, b] as const,
  );

test('the stem is drawn where it plays, slice by slice, its silent bar silent', async ({
  page,
}) => {
  await open(page);
  expect(
    await page.evaluate(() => {
      const a = (window as unknown as W).__ez2bms;
      return a.strips.list(a.doc);
    }),
  ).toEqual(['stem_pad.wav']);
  expect(await strips(page)).toBe(1);
  await goto(page, MEASURE / 2);
  // Measure 0 is the fresh hit's slice (cyan); measure 1, after the first cut (violet).
  const first = await pixels(page, 30, MEASURE - 30);
  const second = await pixels(page, MEASURE + 30, 2 * MEASURE - 30);
  expect(first.bright).toBeGreaterThan(200);
  expect(second.bright).toBeGreaterThan(200);
  expect(first.rgb[1]).toBeGreaterThan(first.rgb[0]! + 60); // 0x58e1ff: green over red
  expect(second.rgb[0]).toBeGreaterThan(second.rgb[1]! - 40); // 0x9d7bff: red about green
  // Measure 9 (12.8-14.4 s) is silent: once the last hit fades, nothing bright.
  await goto(page, 7.5 * MEASURE);
  const silent = await pixels(page, 8.25 * MEASURE, 8.95 * MEASURE);
  const loud = await pixels(page, 7.55 * MEASURE, 7.95 * MEASURE);
  expect(silent.bright).toBe(0);
  expect(loud.bright).toBeGreaterThan(100);
  // Play has none: its field is the game's.
  await page.keyboard.press('Tab');
  await expect.poll(() => strips(page)).toBe(0);
});

test('the slice under the pointer is lit', async ({ page }) => {
  await open(page);
  await goto(page, MEASURE);
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const { x, y, id } = await page.evaluate(
    ([bx, by, m]) => {
      const a = (window as unknown as W).__ez2bms;
      const f = (window as unknown as W).__ez2bmsField;
      const g = f.currentLayout.strips[0];
      const ch = a.doc.data.channels.find((c: { name: string }) => c.name === 'stem_pad.wav').id;
      const cut = a.doc.index.channel(ch).find((n: { y: number }) => n.y === m);
      return { x: bx + g.left + g.width / 2, y: by + f.yOf(m * 1.5), id: cut.id as number };
    },
    [box.x, box.y, MEASURE] as const,
  );
  await page.mouse.move(x, y);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bms.strips.hover))
    .toBe(id);
  await page.mouse.move(box.x + 5, box.y + 5);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bms.strips.hover))
    .toBeNull();
});

test('which files have strips is kept for the song', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    a.strips.unpin(a.doc, 'stem_pad.wav');
  });
  await expect.poll(() => strips(page)).toBe(0);
  // Settings are saved a moment after a change.
  await page.waitForTimeout(600);
  await open(page);
  expect(await strips(page)).toBe(0);
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    a.strips.pin(a.doc, 'bass_a.wav');
    a.strips.pin(a.doc, 'stem_pad.wav');
  });
  await expect.poll(() => strips(page)).toBe(2);
  // The last pinned is the one slicing acts on.
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.strips.focus)).toBe(
    'stem_pad.wav',
  );
});
