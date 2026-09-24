import { expect, test, type Page } from '@playwright/test';

interface W {
  __ez2bms: {
    settings: { set(k: string, v: unknown): void };
    backend: {
      list(dir: string): Promise<{ name: string; size: number }[]>;
      readText(p: string): Promise<string>;
    };
    doc: { transact(label: string, fn: (tx: { setInfo(p: object): void }) => void): void };
  };
}

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

test('the demo song is ready, and Publish writes a whole EZ2PORT package', async ({ page }) => {
  await open(page);
  // No errors. (One warning: the demo's 7K chart is HD with no 7K NM, so EZ2PORT won't list it.)
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.settings.set('songsRoot', '/ez2port/songs'),
  );
  await page.keyboard.press('Control+Shift+P');
  // The dialog says where it goes and what it writes, before anything is written.
  await expect(page.getByTestId('publish-owner')).toHaveText('New');
  await expect(page.getByTestId('publish-charts')).toContainText('streetmix1p-neonparade.ez');
  await page.getByTestId('publish-go').click();
  await expect(page.getByTestId('publish-done')).toContainText(/Published neonparade/);
  const files = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.backend.list('/ez2port/songs/neonparade'),
  );
  const names = files.map((f) => f.name).sort();
  expect(names).toEqual(
    expect.arrayContaining([
      'song.ini',
      'songname.abm',
      'streetmix1p-neonparade.ez',
      'streetmix1p-neonparade.ezi',
      'streetmix1p-neonparade.ini',
      '7streetmix1p-neonparade-hd.ez',
    ]),
  );
  const ini = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.backend.readText('/ez2port/songs/neonparade/song.ini'),
  );
  expect(ini).toContain('Key = neonparade');
  expect(ini).toContain('Category = 48');
  expect(ini).toMatch(/StreetMix\.NM = 6/);
});

test('an error blocks Publish and the Issues tab says why', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.doc.transact('bad level', (tx) => tx.setInfo({ level: 25 })),
  );
  await expect(page.getByTestId('lint')).toContainText('error');
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByText(/to fix first/)).toBeVisible();
  await expect(page.getByText(/outside 1-20/)).toBeVisible();
});

// ---- publishing into a songs folder that already has things in it

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
const ROOT = '/ez2port/songs';
/** Open the Publish dialog and wait for its review (or what stops it). */
async function review(page: Page) {
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByTestId('publish-preparing')).toHaveCount(0);
}

/** Publish through the dialog; returns what it said, and closes it. */
async function publish(page: Page): Promise<string> {
  await review(page);
  await page.getByTestId('publish-go').click();
  const done = page.getByTestId('publish-done');
  await expect(done).toContainText(/Published neonparade/);
  const text = (await done.textContent()) ?? '';
  await page.getByTestId('publish-close').click();
  return text;
}

const list = (page: Page, dir: string): Promise<string[]> =>
  page.evaluate(async (dir) => {
    const a = (window as unknown as { __ez2bms: any }).__ez2bms;
    return (await a.backend.list(dir)).map((e: { name: string }) => e.name).sort();
  }, dir);

const put = (page: Page, path: string, text: string) =>
  page.evaluate(
    async ([path, text]) => {
      const a = (window as unknown as { __ez2bms: any }).__ez2bms;
      await a.backend.writeText(path, text, false);
    },
    [path, text] as const,
  );

async function withRoot(page: Page) {
  await open(page);
  await page.evaluate(
    (root) => (window as unknown as { __ez2bms: any }).__ez2bms.settings.set('songsRoot', root),
    ROOT,
  );
}

test('publishing again keeps the scores of unchanged charts and backs up the old copy', async ({
  page,
}) => {
  await withRoot(page);
  await publish(page);
  const ini = await page.evaluate(
    (root) =>
      (window as unknown as { __ez2bms: any }).__ez2bms.backend.readText(
        `${root}/neonparade/song.ini`,
      ),
    ROOT,
  );
  expect(ini).toMatch(/\[EZ2BMS\]\nSongId = [0-9a-f-]{36}/);
  // EZ2PORT kept scores for both charts.
  await put(page, `${ROOT}/neonparade/rank_StreetMix_neonparade.bin`, 'nm scores');
  await put(page, `${ROOT}/neonparade/rank_7StreetMix_neonparade-hd.bin`, 'hd scores');

  // The dialog says, before writing, which scores stay.
  await review(page);
  await expect(page.getByTestId('publish-owner')).toHaveText('Update');
  await expect(page.getByTestId('publish-charts').locator('[data-scores=kept]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  expect(await publish(page)).toMatch(/kept 2 ranking tables/);
  expect(await list(page, `${ROOT}/neonparade`)).toContain('rank_StreetMix_neonparade.bin');
  expect(await list(page, ROOT)).toEqual(['.ez2bms-backup', 'neonparade']);

  // A note more in the 5K chart (where its lane is free): its scores no longer mean the same.
  await page.evaluate(() => {
    const a = (window as unknown as { __ez2bms: any }).__ez2bms;
    const doc = a.project.charts[0].doc;
    let y = 5 * 960;
    while (doc.index.at(11, y).length || doc.index.holdCovering(11, y)) y += 60;
    doc.transact('x', (tx: any) =>
      tx.insertNotes([{ id: 999_999, ch: doc.data.channels[0].id, x: 11, y, l: 0, c: false }]),
    );
  });
  await review(page);
  await expect(page.getByTestId('publish-charts').locator('[data-scores=reset]')).toContainText(
    'reset',
  );
  await page.keyboard.press('Escape');
  expect(await publish(page)).toMatch(/kept 1 ranking table, reset 1 for changed charts/);
  const names = await list(page, `${ROOT}/neonparade`);
  expect(names).toContain('rank_7StreetMix_neonparade-hd.bin');
  expect(names).not.toContain('rank_StreetMix_neonparade.bin');
});

test("another song's package is only replaced when you say so", async ({ page }) => {
  await withRoot(page);
  await put(
    page,
    `${ROOT}/neonparade/song.ini`,
    '[Song]\nKey = neonparade\nConverter = bmson2ez\n',
  );
  await review(page);
  await expect(page.getByText(/is another song's package/).first()).toBeVisible();
  // Only its key, typed, replaces it.
  await expect(page.getByTestId('publish-go')).toBeDisabled();
  expect(await list(page, `${ROOT}/neonparade`)).toEqual(['song.ini']);
  await page.getByTestId('publish-confirm-key').fill('neonparade');
  await page.getByTestId('publish-go').click();
  await expect(page.getByTestId('publish-done')).toContainText(/Published neonparade/);
  expect(await list(page, `${ROOT}/.ez2bms-backup/neonparade`)).toEqual(['song.ini']);
});

test('the key of a song the game ships is refused', async ({ page }) => {
  await withRoot(page);
  await page.evaluate(() => {
    const a = (window as unknown as { __ez2bms: any }).__ez2bms;
    a.settings.set('gameRoot', '/game');
  });
  await put(page, '/game/Sound/NEONPARADE/placeholder.txt', 'x');
  await review(page);
  await expect(page.getByText(/key of a song the game ships/)).toBeVisible();
  await expect(page.getByTestId('publish-go')).toBeDisabled();
  expect(await list(page, ROOT)).toEqual([]);
});

test('after a key change, the old package can be taken off the wheel', async ({ page }) => {
  await withRoot(page);
  await publish(page);
  await page.evaluate(() => {
    (window as unknown as { __ez2bms: any }).__ez2bms.project.sidecar.key = 'neonparty';
  });
  await review(page);
  await page.getByTestId('publish-go').click();
  await expect(page.getByText(/still in the songs folder as "neonparade"/)).toBeVisible();
  await page.getByTestId('publish-retire').click();
  await expect(page.getByText(/Removed neonparade/)).toBeVisible();
  expect(await list(page, ROOT)).toEqual(['.ez2bms-backup', 'neonparty']);
});
