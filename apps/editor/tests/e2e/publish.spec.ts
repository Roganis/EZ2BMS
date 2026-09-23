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
  await expect(page.getByText(/Published neonparade/)).toBeVisible();
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
async function publish(page: Page) {
  await page.keyboard.press('Control+Shift+P');
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
  await expect(page.getByText(/Published neonparade/)).toBeVisible();
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

  await publish(page);
  await expect(page.getByText(/kept 2 ranking tables/)).toBeVisible();
  expect(await list(page, `${ROOT}/neonparade`)).toContain('rank_StreetMix_neonparade.bin');
  expect(await list(page, ROOT)).toEqual(['.ez2bms-backup', 'neonparade']);

  // A note more in the 5K chart: its scores no longer mean the same.
  await page.evaluate(() => {
    const a = (window as unknown as { __ez2bms: any }).__ez2bms;
    const doc = a.project.charts[0].doc;
    doc.transact('x', (tx: any) =>
      tx.insertNotes([
        { id: 999_999, ch: doc.data.channels[0].id, x: 11, y: 5 * 960, l: 0, c: false },
      ]),
    );
  });
  await publish(page);
  await expect(page.getByText(/kept 1 ranking table, reset 1 for changed charts/)).toBeVisible();
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
  await publish(page);
  await expect(page.getByText(/is another song's package/)).toBeVisible();
  expect(await list(page, `${ROOT}/neonparade`)).toEqual(['song.ini']);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByText(/Published neonparade/)).toBeVisible();
  expect(await list(page, `${ROOT}/.ez2bms-backup/neonparade`)).toEqual(['song.ini']);
});

test('the key of a song the game ships is refused', async ({ page }) => {
  await withRoot(page);
  await page.evaluate(() => {
    const a = (window as unknown as { __ez2bms: any }).__ez2bms;
    a.settings.set('gameRoot', '/game');
  });
  await put(page, '/game/Sound/NEONPARADE/placeholder.txt', 'x');
  await publish(page);
  await expect(page.getByText(/key of a song the game ships/)).toBeVisible();
  expect(await list(page, ROOT)).toEqual([]);
});

test('after a key change, the old package can be taken off the wheel', async ({ page }) => {
  await withRoot(page);
  await publish(page);
  await expect(page.getByText(/Published neonparade/)).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __ez2bms: any }).__ez2bms.project.sidecar.key = 'neonparty';
  });
  await publish(page);
  await expect(page.getByText(/still in the songs folder as "neonparade"/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText(/Removed neonparade/)).toBeVisible();
  expect(await list(page, ROOT)).toEqual(['.ez2bms-backup', 'neonparty']);
});
