// The song on EZ2PORT's song select: its disc at the focus turning a whole
// turn per tier step, the rail of plates, the preview once the wheel stands
// still, the exit eyecatch - with the game's own masks (?skin, a made-up game
// folder) or neon stand-ins. Where everything sits is chart-core's
// selectwheel, checked against the port in selectwheel.oracle.test.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

/** The demo song with a 7K NM made beside its 7K HD, the wheel open on the 7K NM. */
async function openWheel(page: Page, query = '?e2e') {
  await page.goto(`/${query}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.locator('[data-cell="7k.NM"]').click();
  await expect(page.getByTestId('song-manager')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+L');
  await page.getByTestId('song-tab-wheel').click();
  await expect(page.getByTestId('wheel-preview')).toBeVisible();
}

const wheel = (page: Page) => page.getByTestId('wheel-canvas');
const attr = (page: Page, name: string) => wheel(page).getAttribute(`data-${name}`);

/** The mean brightness of a square of the screen, 640x480 pixels. */
const brightness = (page: Page, x: number, y: number, size: number) =>
  wheel(page).evaluate(
    (c: HTMLCanvasElement, [x, y, size]) => {
      const d = c.getContext('2d')!.getImageData(x!, y!, size!, size!).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
      return sum / (d.length / 4) / 3;
    },
    [x, y, size],
  );

const playing = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__ez2bms.preview.playing as boolean);

test('the disc rests at the focus and turns a whole turn per tier', async ({ page }) => {
  await openWheel(page);
  await expect(wheel(page)).toHaveAttribute('data-art', 'neon');
  await expect(wheel(page)).toHaveAttribute('data-focus', 'true');
  // The disc at the port's focus, (473.6, 231.2); the art added onto its base.
  await expect.poll(() => brightness(page, 463, 221, 20)).toBeGreaterThan(40);
  // The rail's focused row: this song's plate at d 700, x 27.
  await expect.poll(() => brightness(page, 30, 190, 200)).toBeGreaterThan(3);

  await expect(page.getByTestId('wheel-tier-SHD')).toBeDisabled();
  await page.getByTestId('wheel-tier-HD').click();
  await expect(wheel(page)).toHaveAttribute('data-angle', '360');
  await page.locator('.screen').focus();
  await page.keyboard.press('1');
  await expect(wheel(page)).toHaveAttribute('data-angle', '0');
});

test('the preview plays once the wheel stands still, and a step stops it', async ({ page }) => {
  await openWheel(page);
  // Entered on this song: the game previews it on the first frame.
  await expect.poll(() => playing(page)).toBe(true);
  await page.locator('.screen').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => playing(page)).toBe(false);
  await expect(wheel(page)).toHaveAttribute('data-cursor', '1');
  // A made-up neighbour: no disc at the focus, no preview.
  await expect(wheel(page)).toHaveAttribute('data-focus', 'false');
  await page.waitForTimeout(700);
  expect(await playing(page)).toBe(false);
  await page.keyboard.press('ArrowUp');
  await expect(wheel(page)).toHaveAttribute('data-cursor', '0');
  await expect.poll(() => playing(page)).toBe(true);
  // Off, it stays quiet; leaving the tab stops it too.
  await page.getByTestId('wheel-sound').uncheck();
  await expect.poll(() => playing(page)).toBe(false);
  await page.getByTestId('wheel-sound').check();
  await expect.poll(() => playing(page)).toBe(true);
  await page.getByTestId('song-tab-charts').click();
  await expect.poll(() => playing(page)).toBe(false);
});

test("with a game folder, the game's masks; the eyecatch fades in under the stage plate", async ({
  page,
}) => {
  await openWheel(page, '?e2e&skin');
  await expect(wheel(page)).toHaveAttribute('data-art', 'game');
  await expect(page.getByTestId('wheel-art')).toContainText("your game's song select masks");
  await expect.poll(() => brightness(page, 463, 221, 20)).toBeGreaterThan(40);

  await page.getByTestId('wheel-view-eyecatch').click();
  await expect(wheel(page)).toHaveAttribute('data-view', 'eyecatch');
  await expect(wheel(page)).toHaveAttribute('data-level', '255');
  // The made-up stage plate's neon bar at the bottom right, added on; above
  // it, the eyecatch's own top-left corner.
  await expect.poll(() => brightness(page, 400, 421, 8)).toBeGreaterThan(120);
  expect(await brightness(page, 40, 100, 40)).toBeGreaterThan(10);
  await page.getByTestId('wheel-replay').click();
  await expect.poll(async () => Number(await attr(page, 'level'))).toBeLessThan(255);
});

test('alone in its category, the rail repeats the one song', async ({ page }) => {
  // Green ink down the rail: a made-up neighbour's 12th-style plate.
  const green = () =>
    wheel(page).evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(26, 64, 256, 416).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 1]! > d[i]! + 80) n++;
      return n;
    });
  await openWheel(page);
  await expect.poll(green).toBeGreaterThan(50);
  await page.getByTestId('wheel-alone').check();
  await expect.poll(green).toBe(0);
  // Every row is this song: a step lands on it again, disc and all.
  await page.locator('.screen').focus();
  await page.keyboard.press('ArrowDown');
  await expect(wheel(page)).toHaveAttribute('data-cursor', '0');
  await expect(wheel(page)).toHaveAttribute('data-focus', 'true');
});
