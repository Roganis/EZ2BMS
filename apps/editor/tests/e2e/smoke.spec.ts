import { expect, test } from '@playwright/test';

test('boot screen renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('BMS');
});

test('perf spike renders pooled sprites', async ({ page }) => {
  await page.goto('/perf.html?notes=5000');
  await page.waitForFunction(() => (window as unknown as { __perf?: unknown }).__perf, null, {
    timeout: 20_000,
  });
  const perf = await page.evaluate(
    () => (window as unknown as { __perf: { fps: number; visible: number } }).__perf,
  );
  expect(perf.visible).toBeGreaterThan(0);
  expect(perf.fps).toBeGreaterThan(0);
});
