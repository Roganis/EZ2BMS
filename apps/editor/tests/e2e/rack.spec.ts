// The background rack with more groups than the window holds (the bench
// song's 61 kits, 1512 sounds): it takes the room right of the lanes,
// narrows its sub-lanes, and scrolls the rest by a bar under its names that
// can be dragged, a sideways swipe or Shift+wheel (render/geometry.ts).

import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hooks are the live App and field */
type W = Window & { __ez2bms: any; __ez2bmsField: any };

test('a rack wider than the window narrows, then scrolls by its bar and a sideways swipe', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?e2e&bench');
  await page.getByTestId('open-folder').click();
  await page.waitForFunction(
    () => ((window as unknown as W).__ez2bmsField?.currentLayout?.rack.groups.length ?? 0) > 60,
  );
  const state = () =>
    page.evaluate(() => {
      const w = window as unknown as W;
      const f = w.__ez2bmsField;
      const l = f.currentLayout;
      return {
        bar: f.rackBar(),
        max: f.rackMaxScroll as number,
        scroll: w.__ez2bms.view.rackScroll as number,
        cursor: w.__ez2bms.view.cursor as number,
        sub: l.rack.sub / l.scale,
        right: l.rack.left + l.rack.width,
        width: l.width as number,
        scale: l.scale as number,
      };
    });
  const s = await state();
  // All the room right of the lanes (to the field's margin), as narrow as
  // sub-lanes go, and a bar for the rest.
  expect(s.width - s.right).toBeLessThanOrEqual(24 * s.scale);
  expect(s.sub).toBeCloseTo(7, 6);
  expect(s.bar).toBeTruthy();
  expect(s.max).toBeGreaterThan(0);

  // Drag the thumb past the right end: scrolled all the way.
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const y = box.y + s.bar.top + s.bar.height / 2;
  await page.mouse.move(box.x + s.bar.thumbLeft + s.bar.thumbWidth / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + s.bar.left + s.bar.width + 80, y, { steps: 5 });
  await page.mouse.up();
  const end = await state();
  expect(end.scroll).toBeCloseTo(end.max, 3);
  expect(end.bar.thumbLeft + end.bar.thumbWidth).toBeCloseTo(end.bar.left + end.bar.width, 3);

  // A sideways swipe over the rack brings it back; the chart does not move.
  await page.mouse.move(box.x + s.right - 40, box.y + 400);
  await page.mouse.wheel(-100_000, 0);
  await expect.poll(async () => (await state()).scroll).toBe(0);
  expect((await state()).cursor).toBe(end.cursor);
  // Shift+wheel scrolls it too.
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await state()).scroll).toBeGreaterThan(0);
});
