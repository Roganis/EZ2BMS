// Song art: the disc and the eyecatch cut from images in the song folder,
// kept in ez2bms.song.json and published as disc.abm / eyecatch.abm. The
// browser build cuts with a canvas (the desktop app with ez2bms-media, whose
// bytes chart-core's art.oracle test checks against EZ2PORT's importer).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function openArt(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-art').click();
  await expect(page.getByTestId('art-disc')).toBeVisible();
}

const songFile = (page: Page) =>
  page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return JSON.parse(await a.backend.readText(`${a.project.dir}/ez2bms.song.json`));
  });

/** How much of a card's cut is lit: proof the host's pixels were drawn. */
const lit = (page: Page, card: 'disc' | 'eyecatch') =>
  page
    .getByTestId(`art-${card}`)
    .getByTestId('art-preview')
    .evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) n++;
      return n / (d.length / 16);
    });

test("the demo's disc and eyecatch come from its chart, as EZ2PORT's importer takes them", async ({
  page,
}) => {
  await openArt(page);
  await expect(page.getByTestId('art-disc')).toContainText("From the charts' eyecatch_image");
  await expect(page.getByTestId('art-eyecatch')).toContainText("From the charts' title_image");
  await expect.poll(() => lit(page, 'disc')).toBeGreaterThan(0.3);
  await expect.poll(() => lit(page, 'eyecatch')).toBeGreaterThan(0.3);
  // A 2:1 banner is taken whole, as the importer does.
  await expect(page.getByTestId('art-mode-stretch')).toHaveClass(/on/);
});

test('a dragged disc crop is saved, and Publish writes both pieces of art', async ({ page }) => {
  await openArt(page);
  const frame = page.getByTestId('art-disc').getByTestId('art-frame');
  await expect(frame).toBeVisible();
  const b = (await frame.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  // 480x360 jacket: the importer's square is x 60; dragged left it starts nearer 0.
  await expect.poll(async () => (await songFile(page)).disc?.crop?.x ?? 60).toBeLessThan(60);
  const song = await songFile(page);
  expect(song.disc.src).toBe('jacket.bmp');
  expect(song.disc.crop.w).toBe(song.disc.crop.h);

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
    const dir = '/ez2port/songs/neonparade';
    const expected = await a.art.packageArt(a.project);
    const same = async (name: string, want: Uint8Array) => {
      const got: Uint8Array = await a.backend.readFile(`${dir}/${name}`);
      return got.length === want.length && got.every((v, i) => v === want[i]);
    };
    return {
      ini: (await a.backend.readText(`${dir}/song.ini`)) as string,
      disc: await same('disc.abm', expected.discAbm),
      eyecatch: await same('eyecatch.abm', expected.eyecatchAbm),
    };
  });
  expect(out.ini).toContain('Disc = disc.abm');
  expect(out.ini).toContain('Eyecatch = eyecatch.abm');
  expect(out.disc).toBe(true);
  expect(out.eyecatch).toBe(true);
});

test('the eyecatch fills the screen 4:3 or goes in whole, and nudges with the keys', async ({
  page,
}) => {
  await openArt(page);
  const card = page.getByTestId('art-eyecatch');
  await card.getByTestId('art-mode-visible').click();
  await expect.poll(async () => (await songFile(page)).eyecatch?.mode).toBe('visible');
  const crop = (await songFile(page)).eyecatch.crop;
  // The banner is 800x400: its centred 4:3 is 533x400.
  expect(crop).toEqual({ x: 133, y: 0, w: 533, h: 400 });
  await card.getByTestId('art-frame').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await songFile(page)).eyecatch.crop.x).toBe(136);
  await expect(card.getByTestId('art-reset')).toBeVisible();
  await card.getByTestId('art-mode-stretch').click();
  await expect
    .poll(async () => (await songFile(page)).eyecatch)
    .toEqual({ src: 'banner.bmp', mode: 'stretch' });
  await expect(card.getByTestId('art-reset')).toBeHidden();
});

test('None turns the disc off, and lint says the wheel will show a blank one', async ({ page }) => {
  await openArt(page);
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
  const source = page.getByTestId('art-disc').getByTestId('art-source');
  await source.selectOption({ label: 'None' });
  await expect.poll(async () => (await songFile(page)).disc).toBeNull();
  await expect(page.getByTestId('art-disc')).toContainText('turned off');
  await expect(page.getByTestId('lint')).toHaveText(/^\s*2 warnings\s*$/);
  await source.selectOption({ label: "Automatic - as EZ2PORT's importer" });
  await expect.poll(async () => 'disc' in (await songFile(page))).toBe(false);
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
});

test('an image dropped on the art page is imported and can be chosen', async ({ page }) => {
  await openArt(page);
  // A PNG drawn at test time, dropped as the OS would.
  const drop = (type: 'dragover' | 'drop') =>
    page.evaluate(async (type) => {
      const c = new OffscreenCanvas(300, 300);
      const g = c.getContext('2d')!;
      g.fillStyle = '#ff4fd8';
      g.fillRect(0, 0, 300, 300);
      g.fillStyle = '#58e1ff';
      g.fillRect(100, 100, 100, 100);
      const blob = await c.convertToBlob({ type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'Dropped Jacket.png', { type: 'image/png' }));
      document.body.dispatchEvent(
        new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    }, type);
  await drop('dragover');
  await expect(page.getByTestId('drop-zone')).toContainText('for the disc and the eyecatch');
  await drop('drop');
  await expect(page.getByText('Imported 1 image')).toBeVisible();
  const source = page.getByTestId('art-disc').getByTestId('art-source');
  await source.selectOption('Dropped Jacket.png');
  await expect.poll(async () => (await songFile(page)).disc).toEqual({ src: 'Dropped Jacket.png' });
  await expect(page.getByTestId('art-disc')).toContainText('300x300');
  await expect.poll(() => lit(page, 'disc')).toBeGreaterThan(0.5);
  // 300 px across shrinks to the 256 disc: nothing to warn about.
  await expect(page.getByTestId('art-disc')).not.toContainText('Upscaled');
});
