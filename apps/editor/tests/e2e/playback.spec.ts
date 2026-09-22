import { expect, test } from '@playwright/test';

test('Space plays from the cursor and the cursor follows the audio clock', async ({ page }) => {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ro-pos')).toHaveText('002:1:00');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await page.keyboard.press('Space');
  // 150 BPM: 0.9 s is a little over two beats.
  const pos = await page.getByTestId('ro-pos').textContent();
  const [m, b] = pos!.split(':').map(Number);
  expect(m! * 4 + b! - 1).toBeGreaterThanOrEqual(9);
  expect(m! * 4 + b! - 1).toBeLessThanOrEqual(12);
  // Stopped: the cursor stays put.
  await page.waitForTimeout(300);
  await expect(page.getByTestId('ro-pos')).toHaveText(pos!);
});
