import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

test('autoplay in the Play view judges every note KOOL and builds a combo', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(page.getByText('SPEED')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('hud-judge')).toHaveText(/KOOL/, { timeout: 5000 });
  await expect(page.getByTestId('hud-combo')).toBeVisible({ timeout: 5000 });
  const combo = Number(await page.getByTestId('hud-combo').textContent());
  expect(combo).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('AUTO PLAY');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result')).toBeHidden();
});

test('test play: unpressed notes are MISSes, a key press sounds and is judged', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('hud-judge')).toHaveText(/MISS/, { timeout: 6000 });
  // Pressing keys never throws, and lane keys do not run editor commands
  // (S would add a STOP, D would switch tools).
  for (const k of ['z', 's', 'x', 'd', 'c', 'Space']) await page.keyboard.press(k);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result')).toBeVisible();
  const misses = await page
    .getByTestId('result')
    .locator('tr', { hasText: 'MISS' })
    .locator('td')
    .textContent();
  expect(Number(misses)).toBeGreaterThan(0);
  const stops = await page.evaluate(
    () =>
      (window as unknown as { __ez2bms: { doc: { data: { stopEvents: unknown[] } } } }).__ez2bms.doc
        .data.stopEvents.length,
  );
  expect(stops).toBe(0);
});
