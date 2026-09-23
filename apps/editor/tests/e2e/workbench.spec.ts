// The keysound workbench over the demo song: waveforms draw, filters find
// unused and missing sounds, and rename / replace / remove reach every chart
// and come back with one Undo.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-workbench').click();
  await expect(page.getByTestId('workbench')).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.locator(`[data-testid=sound-card][data-name="${name}"]`);

/** Every chart's channel names, by chart file. */
const channels = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      (window as unknown as W).__ez2bms.project.charts.map(
        (c: { file: string; doc: { data: { channels: { name: string }[] } } }) => [
          c.file,
          c.doc.data.channels.map((ch) => ch.name).sort(),
        ],
      ),
    ),
  );

test('shows every sound with a waveform, and closes with Esc', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-testid=sound-card]')).toHaveCount(12);
  await expect(card(page, 'stem_pad.wav')).toContainText('40.0 s');
  // Waveforms arrive in a batch; every canvas gets drawn pixels (the least-lit one is counted).
  const leastLit = () =>
    page.evaluate(() => {
      const lit = [
        ...document.querySelectorAll<HTMLCanvasElement>('[data-testid=sound-card] canvas'),
      ].map((c) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
        return n;
      });
      return lit.length === 12 ? Math.min(...lit) : -1;
    });
  await expect.poll(leastLit).toBeGreaterThan(50);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('workbench')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+B');
  await expect(page.getByTestId('workbench')).toBeVisible();
});

test('filters: not used, missing, unused in a chart; remove unused and undo everywhere', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    await a.backend.writeBytes(`${a.project.dir}/vox_hey.wav`, new Uint8Array(0), false);
    await a.project.rescan();
    a.doc.transact('Add sound', (tx: any) => tx.insertChannel({ name: 'gone.wav' }));
  });
  await page.locator('[data-filter=unused]').click();
  await expect(page.locator('[data-testid=sound-card]')).toHaveCount(1);
  await expect(card(page, 'vox_hey.wav')).toContainText('not used');
  await page.locator('[data-filter=missing]').click();
  await expect(page.locator('[data-testid=sound-card]')).toHaveCount(1);
  await expect(card(page, 'gone.wav')).toContainText('missing');
  await page.locator('[data-filter=channels]').click();
  await expect(page.locator('[data-testid=sound-card]')).toHaveCount(3);

  const before = await channels(page);
  await page.getByRole('button', { name: /Remove unused \(3\)/ }).click();
  const after = await channels(page);
  expect(Object.values(after).flat().length).toBe(Object.values(before).flat().length - 3);
  await expect(page.locator('[data-testid=sound-card]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo in all charts' }).click();
  expect(await channels(page)).toEqual(before);
});

test('rename renames the file and every chart, history included; Undo puts it back', async ({
  page,
}) => {
  await open(page);
  const files = () =>
    page.evaluate(async () => {
      const a = (window as unknown as W).__ez2bms;
      return (await a.backend.list(a.project.dir)).map((e: { name: string }) => e.name);
    });
  const kicks = () =>
    page.evaluate(() =>
      (window as unknown as W).__ez2bms.project.charts.map((c: any) =>
        c.doc.data.channels
          .filter((ch: any) => /kick|boom/.test(ch.name))
          .map((ch: any) => ch.name),
      ),
    );
  // An unsaved edit in the open chart that names the sound: its history must follow.
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.doc.transact('Add sound', (tx: any) =>
      tx.insertChannel({ name: 'kick.wav' }),
    ),
  );
  await card(page, 'kick.wav').getByRole('button', { name: 'Rename' }).click();
  const input = page.getByTestId('rename-input');
  await input.fill('boom.wav');
  await input.press('Enter');
  await expect(card(page, 'boom.wav')).toBeVisible();
  await expect(
    page.getByText('Renamed kick.wav to boom.wav in 2 charts (1 unsaved)'),
  ).toBeVisible();
  expect(await files()).toContain('boom.wav');
  expect(await files()).not.toContain('kick.wav');
  expect(await kicks()).toEqual([['boom.wav', 'boom.wav'], ['boom.wav']]);
  // The chart without unsaved changes was saved with the new name at once.
  const other = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    const c = a.project.charts[1];
    return { dirty: c.dirty, text: await a.backend.readText(`${a.project.dir}/${c.file}`) };
  });
  expect(other.dirty).toBe(false);
  expect(other.text).toContain('"boom.wav"');
  // Undo and redo never bring the old name back.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect((await kicks())[0]).toEqual(['boom.wav']);
  await page.keyboard.press('Control+Shift+z');
  expect((await kicks())[0]).toEqual(['boom.wav', 'boom.wav']);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(files).toContain('kick.wav');
  expect(await files()).not.toContain('boom.wav');
  expect(await kicks()).toEqual([['kick.wav', 'kick.wav'], ['kick.wav']]);
});

test('replace plays another file in every chart; one Undo restores them all', async ({ page }) => {
  await open(page);
  const before = await channels(page);
  await card(page, 'snare.wav').getByRole('button', { name: 'Replace' }).click();
  const dialog = page.getByTestId('replace-dialog');
  await dialog.getByPlaceholder('Find a file').fill('clap');
  await dialog.getByRole('button', { name: 'clap.wav' }).click();
  for (const names of Object.values(await channels(page))) expect(names).not.toContain('snare.wav');
  const labels = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.project.charts.map((c: any) => c.doc.undoLabel),
  );
  expect(labels).toEqual(['Replace sound', 'Replace sound']);
  await page.getByRole('button', { name: 'Undo in all charts' }).click();
  expect(await channels(page)).toEqual(before);
});

test('Draw picks the sound as the brush and goes back to the chart', async ({ page }) => {
  await open(page);
  await card(page, 'hat.wav').getByRole('button', { name: 'Draw' }).click();
  await expect(page.getByTestId('workbench')).toHaveCount(0);
  const brush = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return a.doc.channel(a.view.brush)?.name;
  });
  expect(brush).toBe('hat.wav');
});

test('only the rows on screen are built, with 600 sounds', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    for (let i = 0; i < 600; i++)
      await a.backend.writeBytes(
        `${a.project.dir}/kit/perc_${String(i).padStart(3, '0')}.wav`,
        new Uint8Array(0),
        false,
      );
    await a.project.rescan();
  });
  await expect(page.locator('[data-filter=all] b')).toHaveText('612');
  const built = await page.locator('[data-testid=sound-card]').count();
  expect(built).toBeGreaterThan(8);
  expect(built).toBeLessThan(80);
  await page.getByTestId('workbench-grid').evaluate((g) => (g.scrollTop = g.scrollHeight));
  await expect(card(page, 'stem_pad.wav')).toBeVisible();
  expect(await page.locator('[data-testid=sound-card]').count()).toBeLessThan(80);
  await page.getByTestId('workbench-search').fill('perc_1');
  await expect(page.locator('[data-filter=all] b')).toHaveText('612');
  await expect(card(page, 'kit/perc_100.wav')).toBeVisible();
});
