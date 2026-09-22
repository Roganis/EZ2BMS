import { expect, test, type Page } from '@playwright/test';

interface W {
  __ez2bms: {
    project: { charts: { file: string; dirty: boolean }[] } | null;
    doc: { index: { at(x: number, y: number): unknown[] } };
    autosave: { write(p: unknown): Promise<number> };
    closeProject(): void;
    openProject(dir: string): Promise<boolean>;
  };
}

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

test('Ctrl+N makes a chart in any mode, named the way EZ2PORT names charts', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+n');
  const dialog = page.getByTestId('new-chart');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /ClubMix/ }).click();
  await dialog.getByRole('button', { name: 'HD', exact: true }).click();
  await expect(dialog).toContainText('clubmix1p-neonparade-hd.bmson');
  await page.getByTestId('create-chart').click();
  await expect(dialog).toBeHidden();
  const files = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.project!.charts.map((c) => c.file),
  );
  expect(files).toContain('clubmix1p-neonparade-hd.bmson');
  await expect(page.locator('nav[aria-label=Charts] button').last()).toHaveClass(/on/);
  // The same mode and tier again is refused.
  await page.keyboard.press('Control+n');
  await dialog.getByRole('button', { name: /ClubMix/ }).click();
  await dialog.getByRole('button', { name: 'HD', exact: true }).click();
  await expect(page.getByTestId('create-chart')).toBeDisabled();
});

test('unsaved work is autosaved and offered back when the song opens again', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+e');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 40');
  await page.keyboard.press('Enter');
  await page.keyboard.press('z');
  const wrote = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return a.autosave.write(a.project);
  });
  expect(wrote).toBe(1);
  await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    a.closeProject();
    await a.openProject('/demo/Neon Parade');
  });
  await page.getByRole('button', { name: 'Recover' }).click();
  await expect(page.getByText(/Recovered/)).toBeVisible();
  const back = await page.evaluate(
    () => (window as unknown as W).__ez2bms.doc.index.at(11, 40 * 4 * 240).length,
  );
  expect(back).toBe(1);
});
