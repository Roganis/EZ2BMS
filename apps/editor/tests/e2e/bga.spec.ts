// The BGA page: a movie read from its headers (what EZ2PORT's Windows build
// can decode), its start on the chart's clock, the charts' own movie picked
// as EZ2PORT's importer picks it, the preview black before and after the
// movie, and Publish copying it in beside song.ini's [Bga]. The demo's movie
// is headers only (bridge/demo-art.ts demoMovie); what the port makes of real
// ones is chart-core's movie.test and bga.oracle.test.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };
const DIR = '/demo/Neon Parade';

async function openBga(page: Page, before?: () => Promise<void>) {
  await page.goto('/?e2e');
  if (before) await before();
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-bga').click();
  await expect(page.getByTestId('bga-panel')).toBeVisible();
}

const songFile = (page: Page) =>
  page.evaluate(async (dir) => {
    const a = (window as unknown as W).__ez2bms;
    return JSON.parse(await a.backend.readText(`${dir}/ez2bms.song.json`));
  }, DIR);

async function publish(page: Page) {
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.settings.set('songsRoot', '/ez2port/songs'),
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.getByTestId('publish-go').click();
  await expect(page.getByTestId('publish-done')).toContainText(/Published neonparade/);
  await page.getByTestId('publish-close').click();
  return page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    const pkg = '/ez2port/songs/neonparade';
    const names = (await a.backend.list(pkg)).map((e: { name: string }) => e.name);
    return {
      ini: (await a.backend.readText(`${pkg}/song.ini`)) as string,
      names: names as string[],
      movie: names.includes('bga.mp4')
        ? Array.from(await a.backend.readFile(`${pkg}/bga.mp4`))
        : [],
      source: Array.from(await a.backend.readFile('/demo/Neon Parade/Neon Intro.MP4')),
    };
  });
}

/** Set the preview's song position (a range input), ms. */
const scrubTo = (page: Page, ms: number) =>
  page.getByTestId('bga-scrub').evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, ms);

test('a movie is read from its headers, started where you say, and published', async ({ page }) => {
  await openBga(page);
  await expect(page.getByTestId('bga-none')).toHaveClass(/on/);
  await page.getByTestId('bga-file').click();
  await expect(page.getByTestId('bga-codec')).toHaveText('h264');
  await expect(page.getByTestId('bga-size')).toHaveText('640x480');
  await expect(page.getByTestId('bga-verdict')).toHaveAttribute('data-ok', 'true');
  await page.getByTestId('bga-start').fill('1500');
  await page.getByTestId('bga-start').press('Enter');
  await expect
    .poll(async () => (await songFile(page)).bga)
    .toEqual({ file: 'Neon Intro.MP4', startMs: 1500 });
  // A valid movie longer than the song: nothing to lint.
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);

  const out = await publish(page);
  expect(out.ini).toMatch(/\[Bga\]\r?\nFile = bga\.mp4\r?\nStartMs = 1500/);
  // Copied as it is, under an ASCII name.
  expect(out.movie).toEqual(out.source);
});

test('the preview is black before the movie starts and after it ends', async ({ page }) => {
  await openBga(page);
  await page.getByTestId('bga-file').click();
  await page.getByTestId('bga-start').fill('5000');
  await page.getByTestId('bga-start').press('Enter');
  const screen = page.getByTestId('bga-screen');
  await scrubTo(page, 2000);
  await expect(screen).toHaveAttribute('data-shown', 'before');
  await scrubTo(page, 6000);
  await expect(screen).toHaveAttribute('data-shown', 'movie');
  await expect(screen).toHaveAttribute('data-movie-ms', '1000');
  // Started 20 s before the song, the 40 s movie is over at 0:20: it never loops.
  await page.getByTestId('bga-start').fill('-20000');
  await page.getByTestId('bga-start').press('Enter');
  await scrubTo(page, 25000);
  await expect(screen).toHaveAttribute('data-shown', 'after');
  // It covers less of the song than the song lasts: linted.
  await expect(page.getByTestId('lint')).toHaveText(/^\s*2 warnings\s*$/);
  // The browser has no decoder for a movie of headers alone, and says so.
  await expect(page.getByTestId('bga-video-error')).toBeVisible();
});

test("the charts' movie is the importer's pick; one the port cannot read is an error", async ({
  page,
}) => {
  await openBga(page, async () => {
    // The NM chart names the movie, shown from its fourth beat.
    await page.evaluate(async (dir) => {
      const a = (window as unknown as W).__ez2bms;
      const path = `${dir}/streetmix1p-neonparade.bmson`;
      const doc = JSON.parse(await a.backend.readText(path));
      doc.bga = {
        bga_header: [{ id: 1, name: 'Neon Intro.MP4' }],
        bga_events: [{ y: 960, id: 1 }],
        layer_events: [],
        poor_events: [],
      };
      await a.backend.writeText(path, JSON.stringify(doc), false);
    }, DIR);
  });
  await expect(page.getByTestId('bga-charts')).toHaveClass(/on/);
  // Four beats at 150 BPM.
  await expect(page.getByTestId('bga-start')).toHaveValue('1600');
  const out = await publish(page);
  expect(out.ini).toMatch(/File = bga\.mp4\r?\nStartMs = 1600/);

  // An AVI: EZ2PORT's Windows build has no reader for it.
  await page.getByTestId('open-song').click();
  await expect(page.getByTestId('bga-panel')).toBeVisible();
  await page.evaluate(async (dir) => {
    const a = (window as unknown as W).__ez2bms;
    const le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const t = (s: string) => [...s].map((c) => c.charCodeAt(0));
    const chunk = (id: string, body: number[]) => [...t(id), ...le(body.length), ...body];
    const avih = chunk('avih', [
      ...le(40000),
      ...Array(28).fill(0),
      ...le(640),
      ...le(480),
      ...Array(16).fill(0),
    ]);
    const hdrl = chunk('LIST', [...t('hdrl'), ...avih]);
    const riff = [...t('RIFF'), ...le(4 + hdrl.length), ...t('AVI '), ...hdrl];
    await a.backend.writeBytes(`${dir}/old clip.avi`, Uint8Array.from(riff), false);
    await a.project.rescan();
    await a.bga.set({ file: 'old clip.avi' });
  }, DIR);
  await expect(page.getByTestId('bga-verdict')).toHaveAttribute('data-ok', 'false');
  await expect(page.getByTestId('bga-verdict')).toContainText('no AVI reader');
  await expect(page.getByTestId('lint')).toHaveText(/1 error/);
});
