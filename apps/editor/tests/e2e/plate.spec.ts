// The title plate designer: words, colours, CJK forms or your own image,
// kept in ez2bms.song.json and published as songname.abm. The browser build
// draws plates with its canvas (the desktop app renders them as EZ2PORT
// does; chart-core's plate.oracle test proves those bytes).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function openPlate(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-plate').click();
  await expect(page.getByTestId('plate-designer')).toBeVisible();
}

const songFile = (page: Page) =>
  page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return JSON.parse(await a.backend.readText(`${a.project.dir}/ez2bms.song.json`));
  });

/** How much of the preview's plate is bright: proof the plate was drawn. */
const lit = (page: Page) =>
  page.getByTestId('plate-preview').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 400) n++;
    return n;
  });

test("the plate shows the song's title, and a subtitle goes into the song file", async ({
  page,
}) => {
  await openPlate(page);
  await expect(page.getByTestId('plate-title')).toHaveValue('Neon Parade');
  await expect.poll(() => lit(page)).toBeGreaterThan(200);
  await page.getByTestId('plate-subtitle').fill('Extended Mix');
  await page.getByTestId('plate-subtitle').press('Enter');
  await expect.poll(async () => (await songFile(page)).plate).toEqual({ subtitle: 'Extended Mix' });
  const spec = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return a.art.plateSpec(a.project);
  });
  // The shipped two-line layout: title on 15, subtitle on 27 in grey.
  expect(spec.lines.map((l: any) => [l.text, l.baseline, l.cap, l.ink])).toEqual([
    ['Neon Parade', 15, 7, 'ffffff'],
    ['Extended Mix', 27, 6, 'c5c5c5'],
  ]);
});

test('a version colour, or your own, is kept with the song', async ({ page }) => {
  await openPlate(page);
  await page.getByTestId('plate-tint-green').click();
  await expect.poll(async () => (await songFile(page)).plate).toEqual({ tint: 'green' });
  await page.getByTestId('plate-tint-custom').click();
  await expect
    .poll(async () => (await songFile(page)).plate)
    .toEqual({ tint: 'custom', ink: '00f283' });
  await page.getByTestId('plate-ink').evaluate((el: HTMLInputElement) => {
    el.value = '#ff4fd8';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await songFile(page)).plate?.ink).toBe('ff4fd8');
  await page.getByTestId('plate-tint-white').click();
  await expect.poll(async () => 'plate' in (await songFile(page))).toBe(false);
});

test('a character the fonts lack is shown and linted', async ({ page }) => {
  await openPlate(page);
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
  // The private use area: no font has it (the browser build's stand-in says so too).
  await page.getByTestId('plate-title').fill('Neon \u{e000} Parade');
  await page.getByTestId('plate-title').press('Enter');
  await expect(page.getByTestId('plate-missing')).toContainText('\u{e000}');
  await expect(page.getByTestId('lint')).toHaveText(/^\s*2 warnings\s*$/);
  expect((await songFile(page)).plate).toEqual({ title: 'Neon \u{e000} Parade' });
});

test('your own image is the plate, and Publish writes it', async ({ page }) => {
  await openPlate(page);
  await page.getByTestId('plate-mode-image').click();
  await page.getByTestId('plate-image').selectOption('banner.bmp');
  await expect.poll(async () => (await songFile(page)).plate).toEqual({ image: 'banner.bmp' });
  await expect.poll(() => lit(page)).toBeGreaterThan(100);
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.settings.set('songsRoot', '/ez2port/songs'),
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByText(/Published neonparade/)).toBeVisible();
  const same = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    const want: Uint8Array = (await a.art.packageArt(a.project)).songnameAbm;
    const got: Uint8Array = await a.backend.readFile('/ez2port/songs/neonparade/songname.abm');
    return got.length === want.length && got.every((v, i) => v === want[i]);
  });
  expect(same).toBe(true);
});
