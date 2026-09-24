// Files the system hands EZ2BMS (a double-click, or a second launch passing
// its files on): a bmson opens its song at that chart, a BMS file the
// import wizard on its folder, and unsaved work is never left without
// asking. The browser build stands in for the system: ?open= at launch,
// __ez2bmsOpen afterwards.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any; __ez2bmsOpen: (paths: string[]) => void };

const DEMO = '/demo/Neon Parade';
const HD = `${DEMO}/7streetmix1p-neonparade-hd.bmson`;

const where = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return { dir: a.project?.dir as string | undefined, file: a.slot?.file as string | undefined };
  });
const hand = (page: Page, paths: string[]) =>
  page.evaluate((p) => (window as unknown as W).__ez2bmsOpen(p), paths);

test('a chart given at launch opens its song at that chart', async ({ page }) => {
  await page.goto(`/?e2e&open=${encodeURIComponent(HD)}`);
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  expect(await where(page)).toEqual({ dir: DEMO, file: '7streetmix1p-neonparade-hd.bmson' });
});

test('a chart of the open song switches to it; another song asks first when work is unsaved', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  expect((await where(page)).file).toBe('streetmix1p-neonparade.bmson');
  // Another chart of this song, in any case: no question.
  await hand(page, [HD.toUpperCase().replace('/DEMO/NEON PARADE', DEMO)]);
  await expect.poll(async () => (await where(page)).file).toBe('7streetmix1p-neonparade-hd.bmson');

  // A second song, a copy of this one's NM chart.
  await page.evaluate(async (demo) => {
    const b = (window as unknown as W).__ez2bms.backend;
    const text = await b.readText(`${demo}/streetmix1p-neonparade.bmson`);
    await b.writeText('/songs/Other/streetmix1p-other.bmson', text, false);
  }, DEMO);
  // Unsaved work here: it asks, and nothing happens until answered.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('bpm 180');
  await page.keyboard.press('Enter');
  await hand(page, ['/songs/Other/streetmix1p-other.bmson']);
  await expect(
    page.getByText(/Neon Parade has unsaved changes\. Open streetmix1p-other\.bmson anyway\?/),
  ).toBeVisible();
  expect((await where(page)).dir).toBe(DEMO);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect.poll(async () => (await where(page)).dir).toBe('/songs/Other');
  expect((await where(page)).file).toBe('streetmix1p-other.bmson');
});

test('a BMS file opens the import wizard on its folder; other files are refused', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.evaluate(async () => {
    const b = (window as unknown as W).__ez2bms.backend;
    await b.writeText(
      '/bms/Test Song/song_n.bme',
      '#TITLE Test\r\n#BPM 150\r\n#00111:01\r\n',
      false,
    );
  });
  await hand(page, ['/bms/Test Song/readme.txt', '/bms/Test Song/song_n.bme']);
  const w = page.getByTestId('import-wizard');
  await expect(w).toBeVisible();
  await expect(w.getByTestId('bms-dir')).toHaveValue('/bms/Test Song');
  await expect(w.locator('tr[data-file="song_n.bme"]')).toBeVisible();
  await w.press('Escape');

  await hand(page, ['/bms/Test Song/readme.txt']);
  await expect(page.getByText('EZ2BMS does not open readme.txt')).toBeVisible();
});
