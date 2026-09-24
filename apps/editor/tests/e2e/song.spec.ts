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

// ---- the song manager

async function manager(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await expect(page.getByTestId('song-manager')).toBeVisible();
}

const cell = (page: Page, id: string) => page.locator(`[data-cell="${id}"]`);
const charts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as W).__ez2bms.project.charts
      .map((c: any) => `${c.mode}.${c.tier}:${c.doc.data.notes.length}`)
      .sort(),
  );

test('the matrix makes a chart in an empty cell and opens it', async ({ page }) => {
  await manager(page);
  await expect(cell(page, '7k.HD')).toContainText('not listed');
  await cell(page, '7k.NM').click();
  await expect(page.getByTestId('song-manager')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /7 KEY NM/ })).toBeVisible();
  const active = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return { file: a.slot.file, sounds: a.doc.data.channels.length };
  });
  expect(active).toEqual({ file: '7streetmix1p-neonparade.bmson', sounds: 12 });
  // A level-1 NM makes the 7K HD listed.
  await page.keyboard.press('Control+Shift+L');
  await expect(cell(page, '7k.HD')).not.toContainText('not listed');
});

test('Copy duplicates a chart into another cell; Move makes it another tier', async ({ page }) => {
  await manager(page);
  const [nm, hd7] = (await charts(page)).map((c) => c.split(':')[1]);
  const hd = cell(page, '7k.HD');
  await hd.hover();
  await hd.getByRole('button', { name: 'Copy' }).click();
  await cell(page, '5k.EX').click();
  await hd.hover();
  await hd.getByRole('button', { name: 'Move' }).click();
  // Moving stays in the mode: other modes' cells are not targets.
  await expect(cell(page, '10k.EX')).toBeDisabled();
  await cell(page, '7k.SHD').click();
  expect(await charts(page)).toEqual([`5k.EX:${hd7}`, `5k.NM:${nm}`, `7k.SHD:${hd7}`]);
  await expect(cell(page, '7k.SHD')).toContainText('12');
});

test('removing a chart moves its file aside, and Undo brings it back', async ({ page }) => {
  await manager(page);
  const hd = cell(page, '7k.HD');
  await hd.hover();
  await hd.getByRole('button', { name: '×' }).click();
  await expect(page.getByText(/Removed 7 KEY HD/)).toBeVisible();
  expect(await files(page)).not.toContain('7streetmix1p-neonparade-hd.bmson');
  expect(await charts(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => files(page)).toContain('7streetmix1p-neonparade-hd.bmson');
  expect(await charts(page)).toHaveLength(2);
});

test('song info set in the manager is one step per chart, undone everywhere from the toast', async ({
  page,
}) => {
  await manager(page);
  await page.locator('#sm-genre').fill('Eurobeat');
  await page.locator('#sm-genre').press('Enter');
  await expect(page.getByText('Song info changed in 2 charts')).toBeVisible();
  const genres = () =>
    page.evaluate(() =>
      (window as unknown as W).__ez2bms.project.charts.map((c: any) => c.doc.data.info.genre),
    );
  expect(await genres()).toEqual(['Eurobeat', 'Eurobeat']);
  await page.getByRole('button', { name: 'Undo in all charts' }).click();
  expect(await genres()).toEqual(['DEMO', 'DEMO']);
  await page.getByTestId('category').selectOption('1');
  const song = JSON.parse(await readSong(page, 'ez2bms.song.json'));
  expect(song.category).toBe(1);
});
