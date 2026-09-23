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
