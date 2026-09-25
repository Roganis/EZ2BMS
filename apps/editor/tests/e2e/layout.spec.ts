// Smaller windows and touchscreens: the top bar at the desktop's narrowest
// window and with many charts, and the chart scrolled and zoomed with two
// fingers (a touchscreen has no wheel) - the browser preview is often opened
// on a tablet.

import { expect, test, type Page } from '@playwright/test';

interface TouchApp {
  view: { cursor: number; zoom: number };
  slot: { doc: { data: { notes: unknown[] } } };
  project: { charts: { file: string }[] };
  selectChart(i: number): void;
}
type W = Window & { __ez2bms: TouchApp };

async function openDemo(page: Page, extra = '') {
  await page.goto(`/?e2e${extra}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

const view = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return { cursor: a.view.cursor, zoom: a.view.zoom, notes: a.slot.doc.data.notes.length };
  });

test.describe('the narrowest desktop window', () => {
  test.use({ viewport: { width: 960, height: 600 } });

  test('the top bar keeps the chart pills and the Edit/Play switch in view', async ({ page }) => {
    await openDemo(page);
    const play = await page.getByTestId('mode-play').boundingBox();
    expect(play!.x + play!.width).toBeLessThanOrEqual(960);
    const pill = await page.getByRole('button', { name: /5K STANDARD NM/ }).boundingBox();
    expect(pill!.width).toBeGreaterThan(40);
  });

  test("the open chart's pill scrolls into view when the row is too short", async ({ page }) => {
    // Every mode's lane tour: more pills than the row shows.
    await openDemo(page, '&modes');
    const row = page.getByRole('navigation', { name: 'Charts' });
    for (const file of ['streetmix1p-neonparade.bmson', '7streetmix1p-neonparade-hd.bmson']) {
      await page.evaluate((file) => {
        const app = (window as unknown as W).__ez2bms;
        app.selectChart(app.project.charts.findIndex((c) => c.file === file));
      }, file);
      const pill = row.locator('button.on');
      await expect(pill).toHaveAttribute('title', file);
      const [p, r] = [(await pill.boundingBox())!, (await row.boundingBox())!];
      expect(p.x).toBeGreaterThanOrEqual(r.x - 1);
      expect(p.x + p.width).toBeLessThanOrEqual(r.x + r.width + 1);
    }
  });
});

test.describe('on a touchscreen', () => {
  test.use({ hasTouch: true });

  test('two fingers scroll the chart and pinch its zoom, and draw nothing', async ({ page }) => {
    await openDemo(page);
    const box = (await page.getByTestId('playfield').boundingBox())!;
    // Over the lanes, in the middle of the field.
    const x = Math.round(box.x + box.width * 0.3);
    const y = Math.round(box.y + box.height * 0.5);
    const before = await view(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: { x: number; y: number }[],
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
      });
    // The first finger alone would draw; the second one landing cancels it.
    await touch('touchStart', [{ x, y }]);
    await touch('touchStart', [
      { x, y },
      { x: x + 40, y },
    ]);
    // Down 120 px together, spreading from 40 px apart to 80.
    for (let i = 1; i <= 6; i++)
      await touch('touchMove', [
        { x: x - (i * 20) / 6, y: y + i * 20 },
        { x: x + 40 + (i * 20) / 6, y: y + i * 20 },
      ]);
    await touch('touchEnd', []);
    const after = await view(page);
    // Pulled down: later measures came into view.
    expect(after.cursor).toBeGreaterThan(before.cursor);
    expect(after.zoom / before.zoom).toBeCloseTo(2, 1);
    expect(after.notes).toBe(before.notes);
  });
});
