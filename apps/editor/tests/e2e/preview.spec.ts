// The preview picker: the window on the whole song's loudness, auditioned as
// the wheel loops it, kept in ez2bms.song.json and rendered into
// preview.ssf by Publish. The browser build has no mixer (its overview is a
// likeness from the notes); the desktop app's preview is checked against
// EZ2PORT's importer in chart-core's preview.oracle test.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function openPreview(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-preview').click();
  await expect(page.getByTestId('preview-picker')).toBeVisible();
}

const songFile = (page: Page) =>
  page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return JSON.parse(await a.backend.readText(`${a.project.dir}/ez2bms.song.json`));
  });

/** Columns of the overview with something drawn in them. */
const drawn = (page: Page) =>
  page
    .getByTestId('preview-song')
    .locator('canvas')
    .evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext('2d')!;
      const d = g.getImageData(0, Math.floor(c.height / 2) - 2, c.width, 1).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 2]! > 80) n++;
      return n;
    });

test("the preview starts where EZ2PORT's importer would, and the window moves", async ({
  page,
}) => {
  await openPreview(page);
  // The demo's notes run 0:00 to about 0:36: a quarter of the way in is 0:09.
  await expect(page.getByTestId('preview-at')).toContainText('0:09.00');
  await expect(page.getByTestId('preview-at')).toContainText("importer's pick");
  await expect.poll(() => drawn(page)).toBeGreaterThan(100);

  const win = page.getByTestId('preview-window');
  const b = (await win.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await songFile(page)).preview?.startMs ?? 0).toBeGreaterThan(9000);
  const moved = (await songFile(page)).preview.startMs as number;
  await win.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await songFile(page)).preview.startMs).toBe(moved + 100);

  const edge = page.getByTestId('preview-length');
  const e = (await edge.boundingBox())!;
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(e.x + e.width / 2 + 400, e.y + e.height / 2, { steps: 5 });
  await page.mouse.up();
  // Pulled far right: the longest a preview may be.
  await expect.poll(async () => (await songFile(page)).preview.lengthMs).toBe(30000);
  await page.getByTestId('preview-reset').click();
  await expect.poll(async () => 'preview' in (await songFile(page))).toBe(false);
});

test('the loop plays and stops, and a window past the song is linted', async ({ page }) => {
  await openPreview(page);
  await page.getByTestId('preview-play').click();
  await expect(page.getByTestId('preview-play')).toContainText('Stop');
  await page.getByTestId('preview-play').click();
  await expect(page.getByTestId('preview-play')).toContainText('Play');
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
  await page.evaluate(() => (window as unknown as W).__ez2bms.preview.set({ startMs: 600000 }));
  await expect(page.getByTestId('lint')).toHaveText(/^\s*2 warnings\s*$/);
});

test('an audio file can be the preview, and Publish renders it', async ({ page }) => {
  await openPreview(page);
  await page.getByTestId('preview-from-file').click();
  await expect.poll(async () => (await songFile(page)).preview?.file).toBeTruthy();
  const file = (await songFile(page)).preview.file as string;
  await page.getByTestId('preview-from-chart').click();
  await expect.poll(async () => (await songFile(page)).preview?.file).toBeUndefined();
  expect(file).toMatch(/\.wav$/);

  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.settings.set('songsRoot', '/ez2port/songs'),
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.getByTestId('publish-go').click();
  await expect(page.getByTestId('publish-done')).toContainText(/Published neonparade/);
  await page.getByTestId('publish-close').click();
  const out = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    const job = a.preview.packageJob(a.project);
    return {
      ini: (await a.backend.readText('/ez2port/songs/neonparade/song.ini')) as string,
      from: job.from_ms,
      length: job.length_ms,
      sources: job.sources.length,
      events: job.events.length,
    };
  });
  expect(out.ini).toContain('Preview = preview.ssf');
  expect(out).toMatchObject({ from: 9000, length: 20000 });
  expect(out.sources).toBeGreaterThan(3);
  expect(out.events).toBeGreaterThan(100);
});
