import { expect, test, type Page } from '@playwright/test';

async function openDemo(page: Page, query = '') {
  await page.goto(`/?e2e${query}`);
  await page.getByTestId('open-folder').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

/** How much of the playfield is not background: proof something was drawn. */
async function inkRatio(page: Page): Promise<number> {
  const png = await page.getByTestId('playfield').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i]! + d[i + 1]! + d[i + 2]! > 120) ink++;
    return ink / (d.length / 16);
  }, png.toString('base64'));
}

test('opens the demo song and shows both charts', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole('button', { name: /5K STANDARD NM/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /7 KEY HD/ })).toBeVisible();
  await expect(page.getByTestId('channels')).toContainText('kick.wav');
  expect(await inkRatio(page)).toBeGreaterThan(0.01);
});

test('the editor fits the window and holds still while the cursor moves', async ({ page }) => {
  // A bar wider than the window once made the page's width follow the
  // readouts' digits: the playfield resized, and re-baked its textures, on
  // every frame of playback.
  await openDemo(page);
  const sizes = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the ?e2e hook */
    const a = (window as any).__ez2bms;
    const pf = document.querySelector<HTMLElement>('[data-testid=playfield]')!;
    const out = new Set<string>();
    for (let i = 0; i < 12; i++) {
      a.view.cursor = i * 1237;
      await new Promise((r) => requestAnimationFrame(r));
      out.add(`${pf.clientWidth}x${pf.clientHeight}`);
    }
    return { sizes: [...out], over: document.documentElement.scrollWidth - innerWidth };
  });
  expect(sizes.sizes).toHaveLength(1);
  expect(sizes.over).toBeLessThanOrEqual(0);
  const edge = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll('[data-testid=editor] button')].map(
        (b) => b.getBoundingClientRect().right,
      ),
    ),
  );
  expect(edge).toBeLessThanOrEqual(1280);
});

test('the palette runs commands with arguments', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.keyboard.type('goto 11');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('palette')).toBeHidden();
  await expect(page.getByTestId('ro-pos')).toHaveText('011:1:00');
  await expect(page.getByTestId('ro-bpm')).toHaveText('150');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 13');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ro-bpm')).toHaveText('174');
});

test('keys change snap, view and side', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press(']');
  await expect(page.getByTestId('ro-snap')).toHaveText('1/24');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(page.getByTestId('ro-snap')).toHaveText('1/12');
  await page.keyboard.press('Tab');
  await expect(page.getByText('SPEED')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByText('ZOOM')).toBeVisible();
  await page.keyboard.press('F2');
  await expect(page.locator('footer .side')).toHaveText('P2');
});

test('every EZ2PORT mode draws on both sides', async ({ page }, info) => {
  await openDemo(page, '&modes');
  const tabs = page.locator('nav[aria-label=Charts] button');
  const n = await tabs.count();
  expect(n).toBe(7);
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    for (const side of ['P1', 'P2']) {
      if ((await page.locator('footer .side').textContent()) !== side)
        await page.keyboard.press('F2');
      await page.waitForTimeout(150);
      expect(await inkRatio(page), `chart ${i} ${side}`).toBeGreaterThan(0.005);
      await info.attach(`chart-${i}-${side}.png`, {
        body: await page.getByTestId('playfield').screenshot(),
        contentType: 'image/png',
      });
    }
  }
});
