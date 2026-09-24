// Scroll-speed changes in the editor: added by the palette at the cursor,
// listed in the Timing panel, saved as x_scroll_events, undone in one step;
// and the Play view's field scrolling at the speed times the multiplier in
// force, eased to it while the chart plays.

import { expect, test, type Page } from '@playwright/test';
import type { E2EWindow } from './hooks';

interface ScrollApp {
  doc: {
    data: { scrollEvents: { y: number; rate: number }[] };
    undo(): boolean;
  };
  view: { cursor: number; speed: number; mode: string; right: string | null };
  backend: { readText(path: string): Promise<string> };
  project: { dir: string };
  slot: { file: string };
}
type W = E2EWindow & { __ez2bms: ScrollApp; __ez2bmsField: { liveRate: number } };

const M = 4 * 240; // a measure of the demo (resolution 240, 150 BPM: 1.6 s)
const AT = 2 * M; // `goto 2`: measures count from 0

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
}

const palette = async (page: Page, text: string) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__ez2bms.doc.data.scrollEvents);
const rate = (page: Page) => page.evaluate(() => (window as unknown as W).__ez2bmsField.liveRate);

test('a scroll change by the palette: listed, saved, undone', async ({ page }) => {
  await open(page);
  await palette(page, 'goto 2');
  await palette(page, 'scroll 1.5');
  expect(await events(page)).toEqual([{ y: AT, rate: 1.5 }]);
  await palette(page, 'scroll 150%');
  expect(await events(page)).toEqual([{ y: AT, rate: 1.5 }]);

  await page.evaluate(() => ((window as unknown as W).__ez2bms.view.right = 'timing'));
  const row = page.getByTestId('scroll-event');
  await expect(row).toHaveCount(1);
  await expect(row.locator('input')).toHaveValue('1.5');
  // Changed in the panel.
  await row.locator('input').fill('0.75');
  await row.locator('input').press('Enter');
  await expect.poll(() => events(page)).toEqual([{ y: AT, rate: 0.75 }]);

  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved 1 chart')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return JSON.parse(await a.backend.readText(`${a.project.dir}/${a.slot.file}`)).x_scroll_events;
  });
  expect(saved).toEqual([{ y: AT, rate: 0.75 }]);

  // Each change was one undo step.
  await page.keyboard.press('Control+z');
  expect(await events(page)).toEqual([{ y: AT, rate: 1.5 }]);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await events(page)).toEqual([]);
  await expect(row).toHaveCount(0);
  await page.keyboard.press('Control+Shift+Z');
  expect(await events(page)).toEqual([{ y: AT, rate: 1.5 }]);
  // `scroll -` removes it (a bare verb only asks for the number).
  await palette(page, 'goto 2');
  await palette(page, 'scroll -');
  expect(await events(page)).toEqual([]);
});

test('the Play field scrolls at the speed times the multiplier, eased while playing', async ({
  page,
}) => {
  await open(page);
  await palette(page, 'goto 2');
  await palette(page, 'scroll 1.5');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab'); // Play view, at the default 250 %
  await expect.poll(() => rate(page)).toBeCloseTo(2.5, 2);
  // Standing past the change: 250 % x 1.5.
  await page.evaluate(() => ((window as unknown as W).__ez2bms.view.cursor = 3 * 4 * 240));
  await expect.poll(() => rate(page)).toBeCloseTo(3.75, 2);
  await page.evaluate(() => ((window as unknown as W).__ez2bms.view.cursor = 0));
  await expect.poll(() => rate(page)).toBeCloseTo(2.5, 2);

  // Playing across it: 2.5 until measure 2 (3.2 s in), then easing up to 3.75.
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  expect(await rate(page)).toBeCloseTo(2.5, 2);
  await page.waitForFunction(
    () => (window as unknown as W).__ez2bms.view.cursor > 2 * 4 * 240 + 30,
    undefined,
    { timeout: 8000 },
  );
  // Just over the line it has not got there yet...
  expect(await rate(page)).toBeLessThan(3.7);
  // ...and a second later (60 frames of a tenth each) it has.
  await page.waitForTimeout(1200);
  expect(await rate(page)).toBeCloseTo(3.75, 1);
  await page.keyboard.press('Space');
});

test('an imported game song: its scroll change is the chart’s, its other records grey tags', async ({
  page,
}) => {
  await page.goto('/?e2e&game');
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await w.getByTestId('import-song').filter({ hasText: 'Alpha Song' }).click();
  await w.getByTestId('import-dest').fill('/songs/Alpha Song');
  await w.getByTestId('import-go').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  // The synthetic StreetMix NM: ×2 at measure 2, a volume record at the start on track 1.
  expect(await events(page)).toEqual([{ y: 2 * M, rate: 2 }]);

  await page.evaluate(() => ((window as unknown as W).__ez2bms.view.right = 'timing'));
  await expect(page.getByTestId('scroll-event').locator('input')).toHaveValue('2');
  const kept = page.getByTestId('kept-records');
  await kept.locator('summary').click();
  await expect(kept).toContainText('From the game chart (1)');
  await expect(kept).toContainText('vol 100');
  await expect(kept).toContainText('track 1');

  // Its tag hangs under the start's line at the gutter's left; hovering it says what it is.
  await page.waitForTimeout(300);
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const at = await page.evaluate(() => {
    const f = (window as unknown as W).__ez2bmsField as unknown as {
      currentLayout: { gutter: { left: number }; scale: number };
      yOf(p: number): number;
    };
    return { x: f.currentLayout.gutter.left + 8 * f.currentLayout.scale, y: f.yOf(0) + 5 };
  });
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await expect(page.getByTestId('kept-tip')).toContainText('Volume 100 on track 1');
  await page.mouse.move(box.x + at.x + 300, box.y + at.y - 200);
  await expect(page.getByTestId('kept-tip')).toBeHidden();
});
