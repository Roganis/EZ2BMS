// The song as a whole: info shared by every chart, the category, and chart
// files that follow their mode, key and tier when saved.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
}

const files = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return (await a.backend.list(a.project.dir)).map((e: { name: string }) => e.name).sort();
  });

const readSong = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    const a = (window as unknown as W).__ez2bms;
    return a.backend.readText(`${a.project.dir}/${name}`) as Promise<string>;
  }, name);

test('song info typed once goes into every chart', async ({ page }) => {
  await open(page);
  await page.locator('#ci-title').fill('Neon Parade (Extended)');
  await page.locator('#ci-artist').fill('EZ2BMS');
  const titles = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.project.charts.map((c: any) => [
      c.doc.data.info.title,
      c.doc.data.info.artist,
    ]),
  );
  expect(titles).toEqual([
    ['Neon Parade (Extended)', 'EZ2BMS'],
    ['Neon Parade (Extended)', 'EZ2BMS'],
  ]);
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved 2 charts')).toBeVisible();
  expect(await readSong(page, '7streetmix1p-neonparade-hd.bmson')).toContain(
    '"title": "Neon Parade (Extended)"',
  );
});

test('a new tier renames the chart file when saved, and undo brings the name back', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: /7 KEY HD/ }).click();
  await page.getByRole('button', { name: 'SHD', exact: true }).click();
  await expect(page.getByRole('button', { name: /7 KEY SHD/ })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect.poll(() => files(page)).toContain('7streetmix1p-neonparade-shd.bmson');
  expect(await files(page)).not.toContain('7streetmix1p-neonparade-hd.bmson');
  const saved = await readSong(page, '7streetmix1p-neonparade-shd.bmson');
  expect(JSON.parse(saved).info.x_tier).toBe('SHD');

  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: /7 KEY HD/ })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect.poll(() => files(page)).toContain('7streetmix1p-neonparade-hd.bmson');
  expect(await files(page)).not.toContain('7streetmix1p-neonparade-shd.bmson');
});

test('a tier another chart of the mode has is refused', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const p = a.project;
    const data = structuredClone(p.charts[0].doc.data);
    data.info.tier = 'HD';
    const hd = p.addChart('streetmix1p-neonparade-hd.bmson', data, '5k', 'HD');
    return { refused: !a.song.setTier(hd, 'NM'), tier: hd.tier, free: a.song.setTier(hd, 'EX') };
  });
  expect(result).toEqual({ refused: true, tier: 'HD', free: true });
  await expect(page.getByText(/5K STANDARD NM already exists/)).toBeVisible();
});

test('a new song key renames every chart on save, and the category is kept in the song file', async ({
  page,
}) => {
  await open(page);
  await page.locator('#ci-key').fill('neonparty');
  await expect(page.locator('.chart .dot')).toHaveCount(2);
  await page.locator('#ci-category').selectOption('38');
  await page.keyboard.press('Control+s');
  await expect.poll(() => files(page)).toContain('streetmix1p-neonparty.bmson');
  const names = await files(page);
  expect(names).toContain('7streetmix1p-neonparty-hd.bmson');
  expect(names.filter((n) => n.includes('neonparade'))).toEqual([]);
  const song = JSON.parse(await readSong(page, 'ez2bms.song.json'));
  expect(song).toMatchObject({ key: 'neonparty', category: 38 });
  await expect(page.locator('.chart .dot')).toHaveCount(0);
});
